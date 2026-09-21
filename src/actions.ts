import type { CompanionActionDefinitions, DropdownChoice } from '@companion-module/base'
import type { RelayInstance } from './main.js'
import type { RelayTarget } from './types.js'

/** Stands in for the dropdown before Relay has told us what the targets are. */
export const NO_TARGETS = '__no_targets__'

/** What a target action does to the target it names. */
export type TargetMode = 'enable' | 'disable' | 'toggle'

export function targetChoices(targets: RelayTarget[]): DropdownChoice[] {
	if (targets.length === 0) return [{ id: NO_TARGETS, label: 'Connect to Relay to list targets' }]
	return targets.map((target) => ({ id: target.target, label: target.label || target.language_label || target.target }))
}

/**
 * Everything about the target list that the dropdown renders.
 *
 * The source language decides which targets exist, so the list reshapes at
 * runtime. Comparing this tells the instance when to rebuild the definitions,
 * rather than rebuilding on every 1 Hz meter frame.
 */
export function targetSignature(targets: RelayTarget[]): string {
	return targets.map((target) => `${target.target}=${target.label}`).join('\n')
}

/**
 * The enabled value to send, or null when we cannot know it.
 *
 * A toggle needs the current value, and the only honest source is the cached
 * status. Guessing would be worse than refusing: half the time it would send
 * the state the target is already in and look like a dead button.
 */
export function resolveEnabled(mode: TargetMode, current: boolean | undefined): boolean | null {
	if (mode === 'enable') return true
	if (mode === 'disable') return false
	return current === undefined ? null : !current
}

/** Enable one target and disable the rest, as one call per target. */
export function soloPlan(targets: RelayTarget[], chosen: string): { target: string; enabled: boolean }[] {
	// Every target, not just the ones the cache thinks are wrong: the cache can
	// be a second stale, and a solo that silently skipped a target would leave
	// a language live that the operator just took off the air.
	return targets.map((target) => ({ target: target.target, enabled: target.target === chosen }))
}

export function UpdateActions(instance: RelayInstance): void {
	const targets = instance.status?.targets ?? []
	const choices = targetChoices(targets)

	const targetOption = {
		type: 'dropdown' as const,
		id: 'target',
		label: 'Target',
		default: choices[0].id,
		choices,
	}

	const setTarget = async (target: string, enabled: boolean): Promise<void> => {
		await instance.send(
			{ method: 'POST', path: `/api/admin/target/${encodeURIComponent(target)}`, body: { enabled } },
			`${enabled ? 'Enabling' : 'Disabling'} ${target}`,
		)
	}

	const actions: CompanionActionDefinitions = {
		start_capture: {
			name: 'Start capture',
			options: [],
			callback: async () => {
				await instance.send({ method: 'POST', path: '/api/admin/start' }, 'Starting capture')
			},
		},

		stop_capture: {
			name: 'Stop capture',
			options: [],
			callback: async () => {
				await instance.send({ method: 'POST', path: '/api/admin/stop' }, 'Stopping capture')
			},
		},

		toggle_capture: {
			name: 'Toggle capture',
			options: [],
			callback: async () => {
				const status = instance.status
				if (!status) {
					instance.log('error', 'Cannot toggle capture: no status from Relay yet')
					return
				}
				const path = status.running ? '/api/admin/stop' : '/api/admin/start'
				await instance.send({ method: 'POST', path }, status.running ? 'Stopping capture' : 'Starting capture')
			},
		},

		set_target_enabled: {
			name: 'Set target enabled',
			options: [
				targetOption,
				{
					type: 'dropdown',
					id: 'mode',
					label: 'Action',
					default: 'toggle',
					choices: [
						{ id: 'enable', label: 'Enable' },
						{ id: 'disable', label: 'Disable' },
						{ id: 'toggle', label: 'Toggle' },
					],
				},
			],
			callback: async (action) => {
				const target = String(action.options.target ?? '')
				const mode = String(action.options.mode ?? 'toggle') as TargetMode
				if (!target || target === NO_TARGETS) {
					instance.log('error', 'Cannot set a target: no target chosen')
					return
				}

				const current = instance.status?.targets.find((entry) => entry.target === target)?.enabled
				const enabled = resolveEnabled(mode, current)
				if (enabled === null) {
					instance.log('error', `Cannot toggle ${target}: Relay has not said whether it is enabled`)
					return
				}

				await setTarget(target, enabled)
			},
		},

		solo_target: {
			name: 'Enable only this target',
			options: [targetOption],
			callback: async (action) => {
				const chosen = String(action.options.target ?? '')
				const known = instance.status?.targets ?? []
				if (!chosen || chosen === NO_TARGETS) {
					instance.log('error', 'Cannot solo a target: no target chosen')
					return
				}
				if (known.length === 0) {
					instance.log('error', `Cannot solo ${chosen}: Relay has not sent its target list`)
					return
				}

				// Sequential, not parallel: each one is a config write on the
				// relay, and a burst of them races to persist the same file.
				for (const step of soloPlan(known, chosen)) {
					await setTarget(step.target, step.enabled)
				}
			},
		},
	}

	instance.setActionDefinitions(actions)
}
