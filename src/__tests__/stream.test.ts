import { describe, expect, it } from 'vitest'
import { SseParser, backoffDelay, mergeMeter } from '../stream.js'
import type { MeterFrame, RelayStatus } from '../types.js'

const status: RelayStatus = {
	running: true,
	started_at: 1000,
	error: null,
	audio: { level: 0.1, rms_dbfs: -30, device: 'Scarlett' },
	sessions: [
		{ name: 'ES', kind: 'relay', state: 'open', reconnects: 2 },
		{ name: 'FR', kind: 'relay', state: 'open', reconnects: 0 },
	],
	viewers: 7,
	blocklist: ['damn'],
	source_language: 'en',
	targets: [{ target: 'ES', label: 'Spanish', language_label: 'Spanish', enabled: true, live: true }],
}

const meter: MeterFrame = {
	type: 'meter',
	running: true,
	started_at: 1000,
	level: 0.8,
	rms_dbfs: -12,
	peak_dbfs: -3,
	clipping: true,
	clipped_samples: 5,
	speaking: true,
	sessions: [{ name: 'ES', state: 'reconnecting' }],
}

describe('SseParser', () => {
	it('yields a whole frame', () => {
		expect(new SseParser().push('data: {"a":1}\n\n')).toEqual(['{"a":1}'])
	})

	it('reassembles a frame split across chunks', () => {
		const parser = new SseParser()
		expect(parser.push('data: {"run')).toEqual([])
		expect(parser.push('ning":true}\n\n')).toEqual(['{"running":true}'])
	})

	it('yields several frames from one chunk and keeps the partial tail', () => {
		const parser = new SseParser()
		expect(parser.push('data: 1\n\ndata: 2\n\ndata: 3')).toEqual(['1', '2'])
		expect(parser.push('\n\n')).toEqual(['3'])
	})

	it('handles CRLF and multi-line data', () => {
		expect(new SseParser().push('data: a\r\ndata: b\r\n\r\n')).toEqual(['a\nb'])
	})

	it('ignores comment and field lines that are not data', () => {
		expect(new SseParser().push(': keepalive\n\nevent: ping\nid: 4\n\ndata: x\n\n')).toEqual(['x'])
	})
})

describe('mergeMeter', () => {
	const merged = mergeMeter(status, meter)

	it('keeps what the meter frame omits', () => {
		expect(merged.targets).toBe(status.targets)
		expect(merged.viewers).toBe(7)
		expect(merged.blocklist).toEqual(['damn'])
	})

	it('takes the meter values', () => {
		expect(merged.audio.level).toBe(0.8)
		expect(merged.audio.peak_dbfs).toBe(-3)
		expect(merged.audio.clipping).toBe(true)
		expect(merged.audio.speaking).toBe(true)
	})

	it('keeps audio fields the meter frame does not carry', () => {
		expect(merged.audio.device).toBe('Scarlett')
	})

	it('updates session state without losing the health fields', () => {
		expect(merged.sessions[0]).toEqual({ name: 'ES', kind: 'relay', state: 'reconnecting', reconnects: 2 })
	})

	it('leaves sessions the meter frame does not mention alone', () => {
		expect(merged.sessions[1]).toBe(status.sessions[1])
	})

	it('does not mutate the cached status', () => {
		expect(status.audio.level).toBe(0.1)
		expect(status.sessions[0].state).toBe('open')
	})

	it('follows the meter frame when capture stops', () => {
		const stopped = mergeMeter(status, { ...meter, running: false, started_at: null })
		expect(stopped.running).toBe(false)
		expect(stopped.started_at).toBeNull()
	})
})

describe('backoffDelay', () => {
	it('walks 1s, 2s, 5s, 10s and then holds at 15s', () => {
		const mid = () => 0.5
		expect([0, 1, 2, 3, 4, 9].map((n) => backoffDelay(n, mid))).toEqual([1000, 2000, 5000, 10000, 15000, 15000])
	})

	it('jitters within ±20%', () => {
		expect(backoffDelay(0, () => 0)).toBe(800)
		expect(backoffDelay(0, () => 1)).toBe(1200)
	})
})
