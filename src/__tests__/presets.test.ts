import { describe, expect, it } from 'vitest'
import type { CompanionButtonPresetDefinition } from '@companion-module/base'
import { PresetDefinitions } from '../presets.js'
import { COLOUR } from '../feedbacks.js'
import { VariableDefinitions } from '../variables.js'
import type { RelayTarget } from '../types.js'

const targets: RelayTarget[] = [
	{ target: 'SPANISH', label: 'Spanish', language_label: 'Spanish', enabled: true, live: true },
	{ target: 'FRENCH', label: 'French', language_label: 'French', enabled: false, live: false },
]

const presets = PresetDefinitions(targets)
const asButton = (id: string) => presets[id] as CompanionButtonPresetDefinition

describe('PresetDefinitions', () => {
	it('carries the seven fixed buttons plus one per target', () => {
		expect(Object.keys(presets).sort()).toEqual([
			'audio_meter',
			'session_clock',
			'start',
			'status',
			'stop',
			'target_french',
			'target_spanish',
			'toggle',
			'viewers',
		])
	})

	it('regenerates when the target list changes', () => {
		expect(Object.keys(PresetDefinitions([]))).not.toContain('target_spanish')
		expect(Object.keys(PresetDefinitions(targets.slice(0, 1)))).not.toContain('target_french')
	})

	it('files everything under one category', () => {
		for (const preset of Object.values(presets)) expect(preset?.category).toBe('Relay')
	})
})

describe('the capture buttons', () => {
	it('run their action on press and nothing on release', () => {
		expect(asButton('start').steps).toEqual([{ down: [{ actionId: 'start_capture', options: {} }], up: [] }])
		expect(asButton('stop').steps[0].down[0].actionId).toBe('stop_capture')
		expect(asButton('toggle').steps[0].down[0].actionId).toBe('toggle_capture')
	})

	it('shows the state as text on the toggle, so one button says both things', () => {
		expect(asButton('toggle').style.text).toBe('$(relay:running)')
	})
})

describe('the session clock', () => {
	it('has no action at all', () => {
		// A clock that started or stopped the show when brushed past on a full
		// surface is not a clock anyone wants.
		expect(asButton('session_clock').steps).toEqual([])
	})

	it('shows the clock variable', () => {
		expect(asButton('session_clock').style.text).toContain('$(relay:session_time)')
	})
})

describe('the audio meter', () => {
	it('layers clipping after the level, so a clip wins the colour', () => {
		const ids = asButton('audio_meter').feedbacks.map((feedback) => feedback.feedbackId)
		expect(ids).toEqual(['audio_level', 'clipping'])
	})
})

describe('the status button', () => {
	it('puts the error last, so it shows through a running session', () => {
		const ids = asButton('status').feedbacks.map((feedback) => feedback.feedbackId)
		expect(ids).toEqual(['running', 'error'])
	})
})

describe('a target button', () => {
	const spanish = asButton('target_spanish')

	it('toggles that target and no other', () => {
		expect(spanish.steps[0].down[0]).toEqual({
			actionId: 'set_target_enabled',
			options: { target: 'SPANISH', mode: 'toggle' },
		})
	})

	it('names the language and shows its state', () => {
		expect(spanish.name).toBe('Toggle Spanish')
		expect(spanish.style.text).toBe('Spanish\n$(relay:target_spanish_state)')
	})

	it('carries amber first and green second, so live wins', () => {
		expect(spanish.feedbacks.map((feedback) => feedback.feedbackId)).toEqual(['target_enabled_not_live', 'target_live'])
		expect(spanish.feedbacks[0].style?.bgcolor).toBe(COLOUR.amber)
		expect(spanish.feedbacks[1].style?.bgcolor).toBe(COLOUR.green)
	})

	it('scopes both feedbacks to its own target', () => {
		for (const feedback of spanish.feedbacks) expect(feedback.options.target).toBe('SPANISH')
	})
})

describe('every variable a preset references', () => {
	it('exists in the variable definitions', () => {
		const defined = new Set(VariableDefinitions(targets).map((definition) => definition.variableId))
		const referenced = new Set<string>()

		for (const preset of Object.values(presets)) {
			if (preset?.type !== 'button') continue
			for (const match of preset.style.text.matchAll(/\$\(relay:([a-z0-9_]+)\)/g)) referenced.add(match[1])
		}

		expect(referenced.size).toBeGreaterThan(0)
		for (const name of referenced) expect(defined).toContain(name)
	})
})
