import { describe, expect, it } from 'vitest'
import { COLOUR, findTarget, hasError, isReconnecting, levelColour, levelFraction, scaleColour } from '../feedbacks.js'
import { NO_TARGETS } from '../actions.js'
import type { RelayStatus } from '../types.js'

function statusWith(overrides: Partial<RelayStatus> = {}): RelayStatus {
	return {
		running: true,
		started_at: 1000,
		error: null,
		audio: { rms_dbfs: -30, clipping: false, speaking: false },
		sessions: [{ name: 'SPANISH', state: 'connected' }],
		viewers: 0,
		blocklist: [],
		source_language: 'ENGLISH',
		targets: [
			{ target: 'SPANISH', label: 'Spanish', language_label: 'Spanish', enabled: true, live: true },
			{ target: 'FRENCH', label: 'French', language_label: 'French', enabled: true, live: false },
		],
		...overrides,
	}
}

describe('levelFraction', () => {
	it('spans the floor to the ceiling', () => {
		expect(levelFraction(-60)).toBe(0)
		expect(levelFraction(-30)).toBe(0.5)
		expect(levelFraction(0)).toBe(1)
	})

	it('clamps rather than running off the button', () => {
		expect(levelFraction(-90)).toBe(0)
		expect(levelFraction(6)).toBe(1)
	})

	it('is the floor when Relay reports no reading', () => {
		expect(levelFraction(undefined)).toBe(0)
		expect(levelFraction(Number.NaN)).toBe(0)
	})
})

describe('levelColour', () => {
	it('goes amber where headroom runs out, not where the rail is', () => {
		expect(levelColour(-20, false)).toBe(COLOUR.green)
		expect(levelColour(-6, false)).toBe(COLOUR.green)
		expect(levelColour(-3, false)).toBe(COLOUR.amber)
	})

	it('is red whenever clipping, however quiet the average', () => {
		expect(levelColour(-40, true)).toBe(COLOUR.red)
	})
})

describe('scaleColour', () => {
	it('dims towards black', () => {
		expect(scaleColour(COLOUR.green, 1)).toBe(COLOUR.green)
		expect(scaleColour(COLOUR.green, 0)).toBe(COLOUR.black)
	})

	it('keeps a scaled colour on the same hue', () => {
		const half = scaleColour(COLOUR.red, 0.5)
		expect((half >> 16) & 0xff).toBe(100)
		expect(half & 0xff).toBe(0)
	})
})

describe('hasError', () => {
	it('is the error text or a session that gave up', () => {
		expect(hasError(statusWith({ error: 'audio device vanished' }))).toBe(true)
		expect(hasError(statusWith({ sessions: [{ name: 'ES', state: 'error', fatal: true }] }))).toBe(true)
	})

	it('is false on a healthy relay, and before the first status', () => {
		expect(hasError(statusWith())).toBe(false)
		expect(hasError(null)).toBe(false)
	})

	it('does not fire on a session that is merely retrying', () => {
		expect(hasError(statusWith({ sessions: [{ name: 'ES', state: 'reconnecting', fatal: false }] }))).toBe(false)
	})
})

describe('isReconnecting', () => {
	it('fires for a session that is not connected while running', () => {
		expect(isReconnecting(statusWith({ sessions: [{ name: 'ES', state: 'reconnecting' }] }))).toBe(true)
	})

	it('stays dark while capture is stopped', () => {
		// Every session reads idle before a start; lighting this would leave
		// the button amber for most of the day.
		expect(isReconnecting(statusWith({ running: false, sessions: [{ name: 'ES', state: 'idle' }] }))).toBe(false)
	})

	it('stays dark when every session is connected', () => {
		expect(isReconnecting(statusWith())).toBe(false)
	})
})

describe('findTarget', () => {
	it('finds the chosen target', () => {
		expect(findTarget(statusWith(), 'FRENCH')?.label).toBe('French')
	})

	it('finds nothing for the placeholder, an unknown name or no status', () => {
		expect(findTarget(statusWith(), NO_TARGETS)).toBeUndefined()
		expect(findTarget(statusWith(), 'KLINGON')).toBeUndefined()
		expect(findTarget(null, 'FRENCH')).toBeUndefined()
	})
})

describe('the enabled-but-not-live distinction', () => {
	it('separates a language that is on from one that is carrying captions', () => {
		const status = statusWith()
		const spanish = findTarget(status, 'SPANISH')!
		const french = findTarget(status, 'FRENCH')!

		expect(spanish.live).toBe(true)
		expect(french.enabled && !french.live).toBe(true)
	})
})
