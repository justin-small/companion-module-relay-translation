import type { CompanionVariableDefinition, CompanionVariableValues } from '@companion-module/base'
import type { RelayInstance } from './main.js'
import type { RelaySession, RelayStatus, RelayTarget } from './types.js'

/** Shown for the session clock whenever nothing is running. */
export const CLOCK_IDLE = '--:--'

/**
 * A session that is neither carrying captions nor on its way to doing so.
 *
 * `idle` and `connecting` are what every session looks like in the second
 * after a start, so counting them would make the variable flash a fault at the
 * top of every show. `reconnecting` counts: the session was working and is
 * not now, which is exactly what an operator wants to see a number for.
 */
export function isSessionFaulted(session: RelaySession): boolean {
	return session.fatal === true || session.state === 'error' || session.state === 'reconnecting'
}

/** `target_spanish_state`, from the target id the dropdown also sends. */
export function targetVariableId(target: string): string {
	return `target_${target.toLowerCase().replace(/[^a-z0-9]+/g, '_')}_state`
}

/** What a target is doing, in the three states that differ to an operator. */
export function targetState(target: RelayTarget): 'live' | 'enabled' | 'off' {
	if (target.live) return 'live'
	return target.enabled ? 'enabled' : 'off'
}

/** Whole seconds since `started_at`, or null when nothing is running. */
export function elapsedSeconds(startedAt: number | null | undefined, nowMs: number): number | null {
	if (startedAt === null || startedAt === undefined) return null
	// Relay stamps started_at from its own clock, and Companion is a different
	// machine. A clock a few seconds ahead would otherwise run the timer
	// backwards, which reads as a bug rather than as skew.
	return Math.max(0, Math.floor(nowMs / 1000 - startedAt))
}

/** `H:MM:SS`, counting hours without padding, as a session clock reads. */
export function formatClock(seconds: number | null): string {
	if (seconds === null) return CLOCK_IDLE
	const hours = Math.floor(seconds / 3600)
	const minutes = Math.floor((seconds % 3600) / 60)
	const secs = seconds % 60
	return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
}

/**
 * A meter reading, or empty when Relay is not measuring one.
 *
 * Relay sends `audio: {}` when it has no capture object at all, as opposed to
 * a stopped capture that still reports its floor. A blank reads as "no
 * reading" where a formatted 0.00 would read as a live and silent input.
 */
function formatNumber(value: unknown, decimals: number): string {
	return typeof value === 'number' && Number.isFinite(value) ? value.toFixed(decimals) : ''
}

function yesNo(value: unknown): string {
	return value === true ? 'Yes' : 'No'
}

export function VariableDefinitions(targets: RelayTarget[]): CompanionVariableDefinition[] {
	const base: CompanionVariableDefinition[] = [
		{ variableId: 'running', name: 'Capture running or stopped' },
		{ variableId: 'session_time', name: 'Session clock (H:MM:SS)' },
		{ variableId: 'session_time_seconds', name: 'Session length in seconds' },
		{ variableId: 'source_language', name: 'Source language' },
		{ variableId: 'viewers', name: 'Viewers connected' },
		{ variableId: 'targets_live', name: 'Live target count' },
		{ variableId: 'targets_live_labels', name: 'Live target labels' },
		{ variableId: 'level', name: 'Audio level (0-1)' },
		{ variableId: 'rms_dbfs', name: 'Audio RMS (dBFS)' },
		{ variableId: 'peak_dbfs', name: 'Audio peak (dBFS)' },
		{ variableId: 'clipping', name: 'Audio clipping' },
		{ variableId: 'clipped_samples', name: 'Clipped samples' },
		{ variableId: 'speaking', name: 'Speech detected' },
		{ variableId: 'error', name: 'Relay error text' },
		{ variableId: 'sessions_error', name: 'Sessions in trouble' },
	]

	return base.concat(
		targets.map((target) => ({
			variableId: targetVariableId(target.target),
			name: `${target.label} state (live / enabled / off)`,
		})),
	)
}

/** Every variable but the clock, which ticks on its own. */
export function VariableValues(status: RelayStatus): CompanionVariableValues {
	const live = status.targets.filter((target) => target.live)
	const audio = status.audio ?? {}

	const values: CompanionVariableValues = {
		running: status.running ? 'Running' : 'Stopped',
		source_language: status.source_language ?? '',
		viewers: status.viewers,
		targets_live: live.length,
		targets_live_labels: live.map((target) => target.label).join(', '),
		level: formatNumber(audio.level, 2),
		rms_dbfs: formatNumber(audio.rms_dbfs, 1),
		peak_dbfs: formatNumber(audio.peak_dbfs, 1),
		clipping: yesNo(audio.clipping),
		clipped_samples: formatNumber(audio.clipped_samples, 0),
		speaking: yesNo(audio.speaking),
		error: status.error ?? '',
		sessions_error: status.sessions.filter(isSessionFaulted).length,
	}

	for (const target of status.targets) {
		values[targetVariableId(target.target)] = targetState(target)
	}

	return values
}

/** The clock, which a 1 Hz tick advances between status frames. */
export function ClockValues(status: RelayStatus | null, nowMs: number): CompanionVariableValues {
	const seconds = elapsedSeconds(status?.started_at, nowMs)
	return { session_time: formatClock(seconds), session_time_seconds: seconds ?? 0 }
}

/** The values a module with no connection should show, rather than stale ones. */
export function DisconnectedValues(): CompanionVariableValues {
	return {
		running: 'Stopped',
		session_time: CLOCK_IDLE,
		session_time_seconds: 0,
		source_language: '',
		viewers: 0,
		targets_live: 0,
		targets_live_labels: '',
		level: '',
		rms_dbfs: '',
		peak_dbfs: '',
		clipping: 'No',
		clipped_samples: '',
		speaking: 'No',
		error: '',
		sessions_error: 0,
	}
}

export function UpdateVariableDefinitions(instance: RelayInstance): void {
	instance.setVariableDefinitions(VariableDefinitions(instance.status?.targets ?? []))
}
