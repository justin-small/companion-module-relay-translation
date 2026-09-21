import { describe, expect, it } from 'vitest'
import {
	CLOCK_IDLE,
	ClockValues,
	DisconnectedValues,
	VariableDefinitions,
	VariableValues,
	elapsedSeconds,
	formatClock,
	isSessionFaulted,
	targetState,
	targetVariableId,
} from '../variables.js'
import type { RelayStatus, RelayTarget } from '../types.js'

const target = (name: string, label: string, enabled: boolean, live: boolean): RelayTarget => ({
	target: name,
	label,
	language_label: label,
	enabled,
	live,
})

function statusWith(overrides: Partial<RelayStatus> = {}): RelayStatus {
	return {
		running: true,
		started_at: 1000,
		error: null,
		audio: { level: 0.1234, rms_dbfs: -30.46, peak_dbfs: -3.21, clipping: true, clipped_samples: 12, speaking: true },
		sessions: [
			{ name: 'SPANISH', state: 'connected' },
			{ name: 'FRENCH', state: 'reconnecting' },
		],
		viewers: 7,
		blocklist: [],
		source_language: 'ENGLISH',
		targets: [target('SPANISH', 'Spanish', true, true), target('FRENCH', 'French', true, false)],
		...overrides,
	}
}

describe('formatClock', () => {
	it('counts H:MM:SS with unpadded hours', () => {
		expect(formatClock(0)).toBe('0:00:00')
		expect(formatClock(59)).toBe('0:00:59')
		expect(formatClock(3661)).toBe('1:01:01')
		expect(formatClock(36000)).toBe('10:00:00')
	})

	it('shows the idle marker when nothing is running', () => {
		expect(formatClock(null)).toBe(CLOCK_IDLE)
	})
})

describe('elapsedSeconds', () => {
	it('counts whole seconds since the start', () => {
		expect(elapsedSeconds(1000, 1_012_400)).toBe(12)
	})

	it('is null when capture is stopped', () => {
		expect(elapsedSeconds(null, 5000)).toBeNull()
		expect(elapsedSeconds(undefined, 5000)).toBeNull()
	})

	it('does not run backwards when Relay’s clock is ahead', () => {
		expect(elapsedSeconds(1000, 900_000)).toBe(0)
	})

	it('is right when Companion joins a session already in progress', () => {
		expect(formatClock(elapsedSeconds(1000, 8_200_000))).toBe('2:00:00')
	})
})

describe('isSessionFaulted', () => {
	it('counts a session that was working and is not now', () => {
		expect(isSessionFaulted({ name: 'ES', state: 'reconnecting' })).toBe(true)
		expect(isSessionFaulted({ name: 'ES', state: 'error' })).toBe(true)
		expect(isSessionFaulted({ name: 'ES', state: 'connected', fatal: true })).toBe(true)
	})

	it('leaves the states every session passes through on the way up', () => {
		expect(isSessionFaulted({ name: 'ES', state: 'idle' })).toBe(false)
		expect(isSessionFaulted({ name: 'ES', state: 'connecting' })).toBe(false)
		expect(isSessionFaulted({ name: 'ES', state: 'connected' })).toBe(false)
	})
})

describe('targetState', () => {
	it('separates live from merely enabled', () => {
		expect(targetState(target('ES', 'Spanish', true, true))).toBe('live')
		expect(targetState(target('ES', 'Spanish', true, false))).toBe('enabled')
		expect(targetState(target('ES', 'Spanish', false, false))).toBe('off')
	})
})

describe('targetVariableId', () => {
	it('is the dropdown id, lower-cased', () => {
		expect(targetVariableId('SPANISH')).toBe('target_spanish_state')
	})

	it('keeps a multi-word target usable as a variable name', () => {
		expect(targetVariableId('CHINESE (SIMPLIFIED)')).toBe('target_chinese_simplified__state')
	})
})

describe('VariableDefinitions', () => {
	it('defines one variable per target on top of the fixed set', () => {
		const ids = VariableDefinitions(statusWith().targets).map((definition) => definition.variableId)
		expect(ids).toContain('session_time')
		expect(ids).toContain('target_spanish_state')
		expect(ids).toContain('target_french_state')
		expect(VariableDefinitions([]).length).toBe(ids.length - 2)
	})
})

describe('VariableValues', () => {
	const values = VariableValues(statusWith())

	it('words the running state the way a button reads it', () => {
		expect(values.running).toBe('Running')
		expect(VariableValues(statusWith({ running: false })).running).toBe('Stopped')
	})

	it('rounds the meter as specified', () => {
		expect(values.level).toBe('0.12')
		expect(values.rms_dbfs).toBe('-30.5')
		expect(values.peak_dbfs).toBe('-3.2')
		expect(values.clipped_samples).toBe('12')
	})

	it('blanks the meter when Relay is not measuring one', () => {
		const stopped = VariableValues(statusWith({ running: false, audio: {} }))
		expect(stopped.level).toBe('')
		expect(stopped.rms_dbfs).toBe('')
		expect(stopped.clipping).toBe('No')
		expect(stopped.speaking).toBe('No')
	})

	it('counts and names the live targets only', () => {
		expect(values.targets_live).toBe(1)
		expect(values.targets_live_labels).toBe('Spanish')
	})

	it('reports each target separately', () => {
		expect(values.target_spanish_state).toBe('live')
		expect(values.target_french_state).toBe('enabled')
	})

	it('counts the sessions in trouble', () => {
		expect(values.sessions_error).toBe(1)
	})

	it('passes the error text through, empty when there is none', () => {
		expect(values.error).toBe('')
		expect(VariableValues(statusWith({ error: 'audio device vanished' })).error).toBe('audio device vanished')
	})
})

describe('ClockValues', () => {
	it('advances with the wall clock, not with the stream', () => {
		expect(ClockValues(statusWith(), 1_065_000).session_time).toBe('0:01:05')
		expect(ClockValues(statusWith(), 1_065_000).session_time_seconds).toBe(65)
	})

	it('is idle when nothing is running', () => {
		expect(ClockValues(statusWith({ running: false, started_at: null }), 9_000_000)).toEqual({
			session_time: CLOCK_IDLE,
			session_time_seconds: 0,
		})
		expect(ClockValues(null, 9_000_000).session_time).toBe(CLOCK_IDLE)
	})
})

describe('DisconnectedValues', () => {
	it('covers every fixed variable, so none can go stale', () => {
		const fixed = VariableDefinitions([]).map((definition) => definition.variableId)
		expect(Object.keys(DisconnectedValues()).sort()).toEqual(fixed.sort())
	})
})
