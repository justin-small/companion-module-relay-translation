import { combineRgb, type CompanionFeedbackDefinitions } from '@companion-module/base'
import { NO_TARGETS, targetChoices } from './actions.js'
import type { RelayInstance } from './main.js'
import type { RelayStatus, RelayTarget } from './types.js'

/**
 * Button colours, chosen to read on an unlit Stream Deck in a dark booth.
 *
 * Operators will restyle; these are what they see before they do, so they
 * have to be right rather than merely present.
 */
export const COLOUR = {
	white: combineRgb(255, 255, 255),
	black: combineRgb(0, 0, 0),
	green: combineRgb(0, 140, 40),
	red: combineRgb(200, 0, 0),
	amber: combineRgb(190, 120, 0),
	grey: combineRgb(60, 60, 60),
}

/** The window the level bar spans. Speech lives in the top third of it. */
export const DB_FLOOR = -60
export const DB_CEILING = 0

/**
 * A level bar position, 0–1, from dBFS rather than the linear level.
 *
 * `level` is linear amplitude, which puts ordinary speech in the bottom few
 * percent of a bar and leaves it looking dead. dBFS spreads the range an
 * operator actually works in across the whole button.
 */
export function levelFraction(dbfs: number | undefined): number {
	if (typeof dbfs !== 'number' || !Number.isFinite(dbfs)) return 0
	const clamped = Math.min(DB_CEILING, Math.max(DB_FLOOR, dbfs))
	return (clamped - DB_FLOOR) / (DB_CEILING - DB_FLOOR)
}

/**
 * The colour a level should read as: green, amber from -6 dBFS, red clipping.
 *
 * Amber starts where headroom runs out rather than where the rail is reached,
 * matching Relay's own meter so the two do not disagree on screen.
 */
export function levelColour(dbfs: number | undefined, clipping: boolean): number {
	if (clipping) return COLOUR.red
	if (typeof dbfs === 'number' && dbfs > -6) return COLOUR.amber
	return COLOUR.green
}

/** True when Relay is in a state an operator has to do something about. */
export function hasError(status: RelayStatus | null): boolean {
	if (!status) return false
	return Boolean(status.error) || status.sessions.some((session) => session.fatal === true)
}

/**
 * True when a session that should be carrying captions is not.
 *
 * Only while running: every session reads `idle` before a start, and a
 * feedback that lit red on a stopped relay would be lit most of the day.
 */
export function isReconnecting(status: RelayStatus | null): boolean {
	if (!status?.running) return false
	return status.sessions.some((session) => session.state !== undefined && session.state !== 'connected')
}

export function findTarget(status: RelayStatus | null, id: unknown): RelayTarget | undefined {
	// A dropdown sends its id as a string; anything else is a button saved
	// against a target list that no longer exists.
	const name = typeof id === 'string' ? id : ''
	if (!name || name === NO_TARGETS) return undefined
	return status?.targets.find((target) => target.target === name)
}

export function UpdateFeedbacks(instance: RelayInstance): void {
	const targetOption = {
		type: 'dropdown' as const,
		id: 'target',
		label: 'Target',
		default: targetChoices(instance.status?.targets ?? [])[0].id,
		choices: targetChoices(instance.status?.targets ?? []),
	}

	const feedbacks: CompanionFeedbackDefinitions = {
		running: {
			type: 'boolean',
			name: 'Capture running',
			description: 'Relay is capturing and translating',
			defaultStyle: { bgcolor: COLOUR.green, color: COLOUR.white },
			options: [],
			callback: () => instance.status?.running === true,
		},

		stopped: {
			type: 'boolean',
			name: 'Capture stopped',
			description: 'Relay is not capturing',
			defaultStyle: { bgcolor: COLOUR.grey, color: COLOUR.white },
			options: [],
			callback: () => instance.status?.running === false,
		},

		error: {
			type: 'boolean',
			name: 'Relay error',
			description: 'Relay reported an error, or a translation session failed for good',
			defaultStyle: { bgcolor: COLOUR.red, color: COLOUR.white },
			options: [],
			callback: () => hasError(instance.status),
		},

		target_live: {
			type: 'boolean',
			name: 'Target live',
			description: 'A translation session is open for this language',
			defaultStyle: { bgcolor: COLOUR.green, color: COLOUR.white },
			options: [targetOption],
			callback: (feedback) => findTarget(instance.status, feedback.options.target)?.live === true,
		},

		target_enabled_not_live: {
			type: 'boolean',
			name: 'Target enabled but not live',
			description: 'Switched on in Relay, but no session is open — usually because capture is stopped',
			defaultStyle: { bgcolor: COLOUR.amber, color: COLOUR.black },
			options: [targetOption],
			callback: (feedback) => {
				// The distinction the operator cannot afford to misread: a
				// single green would show a lit button over a language that
				// is switched on but carrying nothing.
				const target = findTarget(instance.status, feedback.options.target)
				return target !== undefined && target.enabled && !target.live
			},
		},

		speaking: {
			type: 'boolean',
			name: 'Speaking',
			description: 'Relay hears speech on the input',
			defaultStyle: { bgcolor: COLOUR.green, color: COLOUR.white },
			options: [],
			callback: () => instance.status?.audio?.speaking === true,
		},

		clipping: {
			type: 'boolean',
			name: 'Audio clipping',
			description: 'The input is hitting the rail',
			defaultStyle: { bgcolor: COLOUR.red, color: COLOUR.white },
			options: [],
			callback: () => instance.status?.audio?.clipping === true,
		},

		reconnecting: {
			type: 'boolean',
			name: 'Session reconnecting',
			description: 'A translation session is not connected while capture is running',
			defaultStyle: { bgcolor: COLOUR.amber, color: COLOUR.black },
			options: [],
			callback: () => isReconnecting(instance.status),
		},

		audio_level: {
			type: 'advanced',
			name: 'Audio level (meter)',
			description: 'Colours the button from the input level in dBFS, red when clipping',
			options: [],
			callback: () => {
				const audio = instance.status?.audio
				if (!audio || typeof audio.rms_dbfs !== 'number') return {}

				const fraction = levelFraction(audio.rms_dbfs)
				const colour = levelColour(audio.rms_dbfs, audio.clipping === true)
				// Companion has no partial-fill primitive here, so the bar is
				// the button: brightness stands in for height, and the colour
				// carries the warning.
				return {
					bgcolor: scaleColour(colour, 0.25 + 0.75 * fraction),
					color: COLOUR.white,
				}
			},
		},
	}

	instance.setFeedbackDefinitions(feedbacks)
}

/** Dim a colour towards black, so a quiet input reads as a darker button. */
export function scaleColour(colour: number, fraction: number): number {
	const scale = Math.min(1, Math.max(0, fraction))
	const r = Math.round(((colour >> 16) & 0xff) * scale)
	const g = Math.round(((colour >> 8) & 0xff) * scale)
	const b = Math.round((colour & 0xff) * scale)
	return combineRgb(r, g, b)
}
