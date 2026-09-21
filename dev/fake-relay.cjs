// A stand-in for Relay's admin API, for testing the module without a Relay
// host: same auth header, same /api/admin/state shape, same self-signed TLS.
//
//   openssl req -x509 -newkey rsa:2048 -nodes -days 30 \
//     -keyout dev/certs/key.pem -out dev/certs/cert.pem \
//     -subj "/CN=localhost" -addext "subjectAltName=DNS:localhost"
//   openssl x509 -in dev/certs/cert.pem -noout -fingerprint -sha256
//   node dev/fake-relay.cjs
//
// From inside the Companion container it is host.docker.internal:8443.
const https = require('https')
const fs = require('fs')

const TOKEN = process.env.RELAY_TOKEN || 'good-token'
const CERT_DIR = __dirname + '/certs'
const started = { at: null }

const state = () => ({
	config: { source_language: 'en' },
	status: {
		running: !!started.at,
		started_at: started.at,
		error: null,
		audio: {},
		sessions: started.at ? [{ name: 'ES', kind: 'relay', state: 'open', reconnects: 0, fatal: false }] : [],
		viewers: 0,
		blocklist: [],
		source_language: 'en',
		targets: [
			{ target: 'ES', label: 'Spanish', language_label: 'Spanish', enabled: true, live: !!started.at },
			{ target: 'FR', label: 'French', language_label: 'French', enabled: false, live: false },
		],
	},
	devices: [],
	urls: {},
})

const meter = () => ({
	type: 'meter',
	running: !!started.at,
	started_at: started.at,
	level: Math.random() * 0.5,
	rms_dbfs: -30,
	peak_dbfs: -12,
	clipping: false,
	clipped_samples: 0,
	speaking: !!started.at,
	sessions: started.at ? [{ name: 'ES', state: 'open' }] : [],
})

const server = https.createServer(
	{ key: fs.readFileSync(CERT_DIR + '/key.pem'), cert: fs.readFileSync(CERT_DIR + '/cert.pem') },
	(req, res) => {
		if (req.headers['x-admin-token'] !== TOKEN) {
			res.writeHead(401, { 'content-type': 'application/json' })
			res.end(JSON.stringify({ error: 'unauthorized' }))
			return
		}
		const url = new URL(req.url, 'https://localhost')
		if (url.pathname === '/api/admin/state') {
			res.writeHead(200, { 'content-type': 'application/json' })
			res.end(JSON.stringify(state()))
			return
		}
		if (url.pathname === '/api/admin/status/stream') {
			res.writeHead(200, {
				'content-type': 'text/event-stream',
				'cache-control': 'no-cache, no-transform',
				'x-accel-buffering': 'no',
			})
			// Relay opens with a full status, then ticks a meter frame every second.
			res.write(`data: ${JSON.stringify(state().status)}\n\n`)
			const tick = setInterval(() => res.write(`data: ${JSON.stringify(meter())}\n\n`), 1000)
			res.on('close', () => clearInterval(tick))
			return
		}
		if (url.pathname === '/api/admin/start') {
			started.at = Date.now() / 1000
			res.writeHead(200, { 'content-type': 'application/json' })
			res.end(JSON.stringify({ ok: true }))
			return
		}
		if (url.pathname === '/api/admin/stop') {
			started.at = null
			res.writeHead(200, { 'content-type': 'application/json' })
			res.end(JSON.stringify({ ok: true }))
			return
		}
		res.writeHead(404, { 'content-type': 'application/json' })
		res.end(JSON.stringify({ error: 'not found' }))
	},
)

server.listen(8443, '0.0.0.0', () => console.log('fake relay on 8443'))
