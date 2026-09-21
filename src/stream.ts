import type * as http from 'http'
import { RelayClient, RelayError } from './client.js'
import { isMeterFrame, type MeterFrame, type RelayStateResponse, type RelayStatus, type StatusFrame } from './types.js'

/** Relay pushes a meter frame every second; longer than this and it is gone. */
export const SILENCE_TIMEOUT = 5000

/** 1s, 2s, 5s, 10s, then 15s forever. */
const BACKOFF_STEPS = [1000, 2000, 5000, 10000, 15000]

/** Backoff for the nth consecutive failure (0-based), jittered by ±20%. */
export function backoffDelay(attempt: number, random: () => number = Math.random): number {
	const base = BACKOFF_STEPS[Math.min(attempt, BACKOFF_STEPS.length - 1)]
	return Math.round(base * (0.8 + random() * 0.4))
}

/**
 * Accumulates bytes and yields whole SSE frames.
 *
 * Relay sends `data: {...}\n\n` and nothing else — no event names, no ids — but
 * a chunk boundary can land anywhere, including mid-JSON, so frames have to be
 * reassembled rather than parsed per chunk.
 */
export class SseParser {
	private buffer = ''

	push(chunk: string): string[] {
		this.buffer += chunk.replace(/\r\n/g, '\n')

		const frames: string[] = []
		let split: number
		while ((split = this.buffer.indexOf('\n\n')) !== -1) {
			const raw = this.buffer.slice(0, split)
			this.buffer = this.buffer.slice(split + 2)

			const data = raw
				.split('\n')
				.filter((line) => line.startsWith('data:'))
				.map((line) => line.slice(5).trimStart())
				.join('\n')

			if (data) frames.push(data)
		}
		return frames
	}
}

/**
 * Fold a meter frame into the cached status.
 *
 * The meter frame omits `targets`, `blocklist` and `viewers`, so it cannot
 * replace the status. Its `sessions` are also a thinner shape — name and state
 * only — so they update the state of sessions already known rather than
 * replacing the full health objects a status frame carried.
 */
export function mergeMeter(status: RelayStatus, meter: MeterFrame): RelayStatus {
	const states = new Map(meter.sessions?.map((s) => [s.name, s.state]) ?? [])

	return {
		...status,
		running: meter.running,
		started_at: meter.started_at,
		audio: {
			...status.audio,
			level: meter.level,
			rms_dbfs: meter.rms_dbfs,
			peak_dbfs: meter.peak_dbfs,
			clipping: meter.clipping,
			clipped_samples: meter.clipped_samples,
			speaking: meter.speaking,
		},
		sessions: status.sessions.map((session) =>
			states.has(session.name) ? { ...session, state: states.get(session.name) } : session,
		),
	}
}

export interface StatusStreamHandlers {
	/** A new status, after any meter merge. */
	onStatus: (status: RelayStatus) => void
	/** The stream is open and carrying frames. */
	onConnected: () => void
	/** The stream is down; the next attempt is `retryInMs` away. */
	onDisconnected: (error: RelayError, retryInMs: number) => void
	log: (level: 'debug' | 'info' | 'warn' | 'error', message: string) => void
}

/**
 * Holds `/api/admin/status/stream` open, and keeps it that way.
 *
 * Every reconnect re-fetches `/api/admin/state` first: the target list can
 * change while disconnected, and a module that reconnected with a stale list
 * would show buttons for targets that no longer exist.
 */
export class StatusStream {
	private readonly client: RelayClient
	private readonly handlers: StatusStreamHandlers

	private response: http.IncomingMessage | null = null
	private retryTimer: NodeJS.Timeout | null = null
	private silenceTimer: NodeJS.Timeout | null = null
	private attempt = 0
	private stopped = false
	/** Guards against a late callback from a connection we have moved on from. */
	private generation = 0

	private status: RelayStatus | null = null

	constructor(client: RelayClient, handlers: StatusStreamHandlers) {
		this.client = client
		this.handlers = handlers
	}

	get lastStatus(): RelayStatus | null {
		return this.status
	}

	start(): void {
		this.stopped = false
		void this.connect()
	}

	/** Stop for good: no further frames, no reconnect, no timers left behind. */
	stop(): void {
		this.stopped = true
		this.generation++
		this.clearTimers()
		this.response?.destroy()
		this.response = null
	}

	private clearTimers(): void {
		if (this.retryTimer) clearTimeout(this.retryTimer)
		if (this.silenceTimer) clearTimeout(this.silenceTimer)
		this.retryTimer = null
		this.silenceTimer = null
	}

	private async connect(): Promise<void> {
		if (this.stopped) return
		const generation = ++this.generation

		try {
			// State first: it carries the target list the stream never resends.
			const state = await this.client.request<RelayStateResponse>({
				method: 'GET',
				path: '/api/admin/state',
				timeout: 10000,
			})
			if (this.stopped || generation !== this.generation) return

			if (state?.status) this.publish(state.status)

			const response = await this.client.openStream('/api/admin/status/stream')
			if (this.stopped || generation !== this.generation) {
				response.destroy()
				return
			}

			this.response = response
			this.attempt = 0
			this.handlers.onConnected()
			this.readFrames(response, generation)
		} catch (error) {
			if (this.stopped || generation !== this.generation) return
			this.scheduleRetry(error)
		}
	}

	private readFrames(response: http.IncomingMessage, generation: number): void {
		const parser = new SseParser()
		response.setEncoding('utf8')

		const armWatchdog = () => {
			if (this.silenceTimer) clearTimeout(this.silenceTimer)
			this.silenceTimer = setTimeout(() => {
				if (generation !== this.generation) return
				// A stream that has gone quiet is not a stream that is idle:
				// Relay ticks at 1 Hz, so silence means the socket is dead in a
				// way TCP has not noticed yet. Report before destroying, so the
				// reason is the silence rather than the abort that follows it.
				this.dropped(generation, new RelayError('connection', 'Status stream went silent'))
				response.destroy()
			}, SILENCE_TIMEOUT)
		}

		armWatchdog()

		response.on('data', (chunk: string) => {
			if (generation !== this.generation) return
			armWatchdog()

			for (const raw of parser.push(chunk)) {
				let frame: StatusFrame
				try {
					frame = JSON.parse(raw) as StatusFrame
				} catch {
					this.handlers.log('debug', 'Ignored an unparsable status frame')
					continue
				}

				if (isMeterFrame(frame)) {
					// A meter frame before any status is not enough to render
					// from: no targets, no viewers. Wait for the status frame
					// Relay sends when the stream opens.
					if (this.status) this.publish(mergeMeter(this.status, frame))
				} else {
					this.publish(frame)
				}
			}
		})

		response.on('end', () => this.dropped(generation, new RelayError('connection', 'Relay closed the status stream')))
		response.on('error', (error: Error) => this.dropped(generation, this.streamError(error)))
		// A socket that dies under the response surfaces as 'aborted', whose
		// own message is the single word "aborted".
		response.on('aborted', () => this.dropped(generation, this.streamError(new Error('aborted'))))
	}

	/** Node's own wording here is a bare "aborted"; an operator needs the host. */
	private streamError(error: Error): RelayError {
		if (error instanceof RelayError) return error
		return new RelayError('connection', `Lost the status stream from ${this.client.baseUrl}`)
	}

	private dropped(generation: number, error: RelayError): void {
		if (this.stopped || generation !== this.generation) return
		// One dead connection, one retry: destroying a response emits both
		// 'aborted' and 'error', and the watchdog may have got there first.
		this.generation++
		this.response = null
		this.clearTimers()
		this.scheduleRetry(error)
	}

	private scheduleRetry(error: unknown): void {
		const relayError =
			error instanceof RelayError
				? error
				: new RelayError('connection', error instanceof Error ? error.message : 'Status stream failed')

		const delay = backoffDelay(this.attempt++)
		this.handlers.onDisconnected(relayError, delay)

		if (this.retryTimer) clearTimeout(this.retryTimer)
		this.retryTimer = setTimeout(() => {
			this.retryTimer = null
			void this.connect()
		}, delay)
	}

	private publish(status: RelayStatus): void {
		this.status = status
		this.handlers.onStatus(status)
	}
}
