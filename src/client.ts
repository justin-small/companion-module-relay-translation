import * as http from 'http'
import * as https from 'https'
import * as tls from 'tls'
import type { Duplex } from 'stream'
import { normaliseFingerprint, type RelayConfig } from './config.js'

/** Why a request failed, in the terms the instance status cares about. */
export type RelayErrorKind = 'auth' | 'tls' | 'connection' | 'http' | 'response'

export class RelayError extends Error {
	readonly kind: RelayErrorKind
	readonly statusCode?: number

	constructor(kind: RelayErrorKind, message: string, statusCode?: number) {
		super(message)
		this.name = 'RelayError'
		this.kind = kind
		this.statusCode = statusCode
	}
}

/**
 * An https.Agent that pins the peer certificate to a SHA-256 fingerprint.
 *
 * Pinning cannot go through `checkServerIdentity`: Node skips it entirely when
 * `rejectUnauthorized` is false, which is exactly the case a self-signed Relay
 * certificate puts us in. So the check happens on the TLS socket itself, and a
 * mismatch destroys the socket with an error the request then reports.
 */
class FingerprintAgent extends https.Agent {
	private readonly expected: string

	constructor(options: https.AgentOptions, expected: string) {
		super(options)
		this.expected = expected
	}

	createConnection(options: https.RequestOptions): Duplex {
		// Chain verification is already off; the fingerprint is the check.
		const socket = tls.connect({ ...(options as tls.ConnectionOptions), rejectUnauthorized: false })

		socket.on('secureConnect', () => {
			const actual = normaliseFingerprint(socket.getPeerCertificate()?.fingerprint256 ?? '')
			if (actual !== this.expected) {
				socket.destroy(
					new RelayError(
						'tls',
						`Certificate fingerprint does not match the one configured (server: ${
							actual ? formatFingerprint(actual) : 'no certificate'
						})`,
					),
				)
			}
		})

		return socket
	}
}

function formatFingerprint(value: string): string {
	return (value.match(/.{2}/g) ?? []).join(':').toUpperCase()
}

/** TLS failures Node reports by code, mapped to something an operator can act on. */
const TLS_ERROR_CODES = new Set([
	'DEPTH_ZERO_SELF_SIGNED_CERT',
	'SELF_SIGNED_CERT_IN_CHAIN',
	'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
	'CERT_HAS_EXPIRED',
	'ERR_TLS_CERT_ALTNAME_INVALID',
	'UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
])

export interface RelayRequest {
	method: 'GET' | 'POST'
	path: string
	body?: unknown
	/** Milliseconds before an unanswered request is treated as a dead connection. */
	timeout?: number
}

/**
 * The authenticated HTTP client every other part of the module goes through.
 *
 * The admin token is a header and only a header: never a query parameter,
 * never logged, and never part of an error message that reaches the UI.
 */
export class RelayClient {
	private readonly config: RelayConfig
	private readonly agent: http.Agent | https.Agent

	constructor(config: RelayConfig) {
		this.config = config
		this.agent = RelayClient.makeAgent(config)
	}

	get baseUrl(): string {
		const scheme = this.config.https ? 'https' : 'http'
		return `${scheme}://${this.config.host}:${this.config.port}`
	}

	private static makeAgent(config: RelayConfig): http.Agent | https.Agent {
		if (!config.https) return new http.Agent({ keepAlive: true })

		const options: https.AgentOptions = {
			keepAlive: true,
			rejectUnauthorized: !config.acceptSelfSigned,
		}

		const fingerprint = normaliseFingerprint(config.fingerprint)
		if (!fingerprint) return new https.Agent(options)

		// A pinned certificate is its own proof of identity, so chain
		// verification is off and the fingerprint is the whole check.
		return new FingerprintAgent({ ...options, rejectUnauthorized: false }, fingerprint)
	}

	/** Free sockets so a config change does not leave connections behind. */
	destroy(): void {
		this.agent.destroy()
	}

	/**
	 * Open a long-lived response and hand back the stream itself.
	 *
	 * Deliberately not `request()`: an SSE body never ends, so nothing here may
	 * buffer it or apply an inactivity timeout to the response as a whole. The
	 * caller owns the returned stream and must destroy it.
	 */
	async openStream(path: string, connectTimeout = 10000): Promise<http.IncomingMessage> {
		const url = new URL(path, this.baseUrl)
		const transport = this.config.https ? https : http

		return new Promise<http.IncomingMessage>((resolve, reject) => {
			const req = transport.request(
				url,
				{
					method: 'GET',
					headers: { 'x-admin-token': this.config.token, accept: 'text/event-stream' },
					agent: this.agent,
				},
				(res) => {
					clearTimeout(connectTimer)
					const status = res.statusCode ?? 0

					if (status === 401 || status === 403) {
						res.destroy()
						reject(new RelayError('auth', 'Admin token rejected', status))
						return
					}
					if (status < 200 || status >= 300) {
						res.destroy()
						reject(new RelayError('http', `Relay returned HTTP ${status} for the status stream`, status))
						return
					}

					resolve(res)
				},
			)

			// Bounds the connect, not the stream: once the response arrives the
			// watchdog on the frames themselves takes over.
			const connectTimer = setTimeout(() => {
				req.destroy(new RelayError('connection', `No response from ${this.config.host}:${this.config.port}`))
			}, connectTimeout)

			req.on('error', (error: NodeJS.ErrnoException) => {
				clearTimeout(connectTimer)
				reject(toRelayError(error, this.config))
			})

			req.end()
		})
	}

	async request<T>(request: RelayRequest): Promise<T> {
		const url = new URL(request.path, this.baseUrl)
		const payload = request.body === undefined ? undefined : Buffer.from(JSON.stringify(request.body))

		const headers: Record<string, string> = {
			'x-admin-token': this.config.token,
			accept: 'application/json',
		}
		if (payload) {
			headers['content-type'] = 'application/json'
			headers['content-length'] = String(payload.length)
		}

		const transport = this.config.https ? https : http

		return new Promise<T>((resolve, reject) => {
			const req = transport.request(
				url,
				{ method: request.method, headers, agent: this.agent, timeout: request.timeout ?? 10000 },
				(res) => {
					const chunks: Buffer[] = []
					res.on('data', (chunk: Buffer) => chunks.push(chunk))
					res.on('end', () => {
						const status = res.statusCode ?? 0
						const text = Buffer.concat(chunks).toString('utf8')

						if (status === 401 || status === 403) {
							reject(new RelayError('auth', 'Admin token rejected', status))
							return
						}
						if (status < 200 || status >= 300) {
							reject(new RelayError('http', describeHttpFailure(status, text), status))
							return
						}

						if (!text) {
							resolve(undefined as T)
							return
						}
						try {
							resolve(JSON.parse(text) as T)
						} catch {
							reject(new RelayError('response', 'Relay returned a response that was not JSON'))
						}
					})
				},
			)

			req.on('timeout', () => {
				req.destroy(new RelayError('connection', `No response from ${this.config.host}:${this.config.port}`))
			})

			req.on('error', (error: NodeJS.ErrnoException) => {
				reject(toRelayError(error, this.config))
			})

			if (payload) req.write(payload)
			req.end()
		})
	}
}

function describeHttpFailure(status: number, body: string): string {
	// Relay answers failures with {"error": "..."}; anything else is not worth
	// pasting into the UI verbatim.
	try {
		const parsed = JSON.parse(body) as { error?: unknown }
		if (typeof parsed.error === 'string' && parsed.error) return `Relay refused the request: ${parsed.error}`
	} catch {
		// fall through to the status code
	}
	return `Relay returned HTTP ${status}`
}

export function toRelayError(error: NodeJS.ErrnoException, config: RelayConfig): RelayError {
	if (error instanceof RelayError) return error

	const code = error.code ?? ''

	if (TLS_ERROR_CODES.has(code)) {
		return new RelayError(
			'tls',
			"Relay's certificate was refused. It is self-signed by design: turn on " +
				'"Accept self-signed certificate", or paste its SHA-256 fingerprint to pin it.',
		)
	}

	if (code === 'ECONNREFUSED' || code === 'EHOSTUNREACH' || code === 'ENETUNREACH') {
		return new RelayError('connection', `Nothing answering on ${config.host}:${config.port}`)
	}
	if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') {
		return new RelayError('connection', `Cannot resolve ${config.host}`)
	}
	if (code === 'ETIMEDOUT' || code === 'ECONNRESET' || code === 'EPIPE') {
		return new RelayError('connection', `Connection to ${config.host}:${config.port} failed (${code})`)
	}

	// Anything unclassified: the message, but never the request, which carries
	// the token.
	return new RelayError('connection', error.message || 'Connection failed')
}
