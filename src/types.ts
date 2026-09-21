/** The shapes Relay's admin API sends. Only what the module reads is typed. */

export interface RelayTarget {
	target: string
	label: string
	language_label: string
	enabled: boolean
	live: boolean
}

/** One realtime session's health, as `status()` reports it. */
export interface RelaySession {
	name: string
	kind?: string
	state?: string
	error?: string | null
	model?: string
	last_delta_ts?: number | null
	connected_at?: number | null
	reconnects?: number
	fatal?: boolean
	dropped_audio?: number
}

export interface RelayAudio {
	level?: number
	rms_dbfs?: number
	peak_dbfs?: number
	clipping?: boolean
	clipped_samples?: number
	speaking?: boolean
	[key: string]: unknown
}

export interface RelayStatus {
	running: boolean
	/** Unix epoch seconds when capture started, null when stopped. */
	started_at: number | null
	error?: string | null
	audio: RelayAudio
	sessions: RelaySession[]
	viewers: number
	blocklist: string[]
	blocklist_file?: string
	source_language?: string
	targets: RelayTarget[]
}

/** The ~1 Hz frame. Deliberately omits targets, blocklist and viewers. */
export interface MeterFrame {
	type: 'meter'
	running: boolean
	started_at: number | null
	level: number
	rms_dbfs: number
	peak_dbfs: number
	clipping: boolean
	clipped_samples: number
	speaking: boolean
	sessions: { name: string; state: string }[]
}

export interface RelayStateResponse {
	config?: Record<string, unknown>
	status: RelayStatus
	devices?: unknown[]
	urls?: Record<string, unknown>
}

export type StatusFrame = RelayStatus | MeterFrame

export function isMeterFrame(frame: StatusFrame): frame is MeterFrame {
	return (frame as MeterFrame).type === 'meter'
}
