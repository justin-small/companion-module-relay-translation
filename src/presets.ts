import type { CompanionButtonPresetDefinition, CompanionPresetDefinitions } from '@companion-module/base'
import { COLOUR } from './feedbacks.js'
import { targetVariableId } from './variables.js'
import type { RelayInstance } from './main.js'
import type { RelayTarget } from './types.js'

const CATEGORY = 'Relay'

/** The unlit state every preset starts from: white on near-black. */
const BASE = { size: '14' as const, color: COLOUR.white, bgcolor: COLOUR.black }

function button(
	name: string,
	text: string,
	extras: Partial<CompanionButtonPresetDefinition> = {},
): CompanionButtonPresetDefinition {
	return {
		type: 'button',
		category: CATEGORY,
		name,
		style: { ...BASE, text },
		steps: [],
		feedbacks: [],
		...extras,
	}
}

/** A button that runs one action on press and nothing on release. */
function press(actionId: string, options: Record<string, string> = {}) {
	return [{ down: [{ actionId, options }], up: [] }]
}

/**
 * Presets for the current target list.
 *
 * Exported separately from the instance so the shape can be asserted without
 * a Companion to drag them onto.
 */
export function PresetDefinitions(targets: RelayTarget[]): CompanionPresetDefinitions {
	const presets: CompanionPresetDefinitions = {
		start: button('Start capture', 'START', {
			steps: press('start_capture'),
			feedbacks: [{ feedbackId: 'running', options: {}, style: { bgcolor: COLOUR.green, color: COLOUR.white } }],
		}),

		stop: button('Stop capture', 'STOP', {
			steps: press('stop_capture'),
			feedbacks: [{ feedbackId: 'stopped', options: {}, style: { bgcolor: COLOUR.grey, color: COLOUR.white } }],
		}),

		toggle: button('Toggle capture', '$(relay:running)', {
			steps: press('toggle_capture'),
			feedbacks: [{ feedbackId: 'running', options: {}, style: { bgcolor: COLOUR.green, color: COLOUR.white } }],
		}),

		session_clock: button('Session clock', 'SESSION\n$(relay:session_time)', {
			// No action: a clock that started or stopped the show when brushed
			// past on a full surface is not a clock anyone wants.
			feedbacks: [{ feedbackId: 'running', options: {}, style: { bgcolor: COLOUR.green, color: COLOUR.white } }],
		}),

		audio_meter: button('Audio meter', '$(relay:rms_dbfs) dB', {
			feedbacks: [
				{ feedbackId: 'audio_level', options: {} },
				// Layered after the level, so a clip always wins the colour.
				{ feedbackId: 'clipping', options: {}, style: { bgcolor: COLOUR.red, color: COLOUR.white } },
			],
		}),

		viewers: button('Viewers', 'VIEWERS\n$(relay:viewers)'),

		status: button('Status at a glance', '$(relay:running)\n$(relay:targets_live) live', {
			feedbacks: [
				{ feedbackId: 'running', options: {}, style: { bgcolor: COLOUR.green, color: COLOUR.white } },
				// Last, so an error shows through a running session rather
				// than being hidden by it.
				{ feedbackId: 'error', options: {}, style: { bgcolor: COLOUR.red, color: COLOUR.white } },
			],
		}),
	}

	for (const target of targets) {
		presets[`target_${target.target.toLowerCase()}`] = button(
			`Toggle ${target.label}`,
			`${target.label}\n$(relay:${targetVariableId(target.target)})`,
			{
				steps: press('set_target_enabled', { target: target.target, mode: 'toggle' }),
				feedbacks: [
					// Amber first, green second: a live target is also an
					// enabled one, and live is what the operator needs to see.
					{
						feedbackId: 'target_enabled_not_live',
						options: { target: target.target },
						style: { bgcolor: COLOUR.amber, color: COLOUR.black },
					},
					{
						feedbackId: 'target_live',
						options: { target: target.target },
						style: { bgcolor: COLOUR.green, color: COLOUR.white },
					},
				],
			},
		)
	}

	return presets
}

export function UpdatePresets(instance: RelayInstance): void {
	instance.setPresetDefinitions(PresetDefinitions(instance.status?.targets ?? []))
}
