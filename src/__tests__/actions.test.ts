import { describe, expect, it } from 'vitest'
import { NO_TARGETS, UpdateActions, resolveEnabled, soloPlan, targetChoices, targetSignature } from '../actions.js'
import type { RelayStatus, RelayTarget } from '../types.js'

const target = (name: string, label: string, enabled: boolean): RelayTarget => ({
	target: name,
	label,
	language_label: label,
	enabled,
	live: enabled,
})

const targets = [target('ES', 'Spanish', true), target('FR', 'French', false)]

function statusWith(overrides: Partial<RelayStatus> = {}): RelayStatus {
	return {
		running: false,
		started_at: null,
		error: null,
		audio: {},
		sessions: [],
		viewers: 0,
		blocklist: [],
		source_language: 'en',
		targets,
		...overrides,
	}
}

/** Enough of the instance for the callbacks, without booting the entrypoint. */
function fakeInstance(status: RelayStatus | null) {
	const sent: { method: string; path: string; body?: unknown }[] = []
	const logs: { level: string; message: string }[] = []
	let definitions: Record<string, { name: string; options: unknown[]; callback: (a: never) => Promise<void> }> = {}

	const instance = {
		status,
		send: async (request: { method: string; path: string; body?: unknown }) => {
			sent.push(request)
		},
		log: (level: string, message: string) => logs.push({ level, message }),
		setActionDefinitions: (next: typeof definitions) => (definitions = next),
	}

	UpdateActions(instance as unknown as Parameters<typeof UpdateActions>[0])

	return {
		sent,
		logs,
		async run(id: string, options: Record<string, unknown> = {}) {
			await definitions[id].callback({ options } as never)
		},
		get definitions() {
			return definitions
		},
	}
}

describe('targetChoices', () => {
	it('sends the target and shows the label', () => {
		expect(targetChoices(targets)).toEqual([
			{ id: 'ES', label: 'Spanish' },
			{ id: 'FR', label: 'French' },
		])
	})

	it('falls back to the language label, then the target itself', () => {
		expect(targetChoices([{ ...target('ES', '', true), language_label: 'Spanish' }])[0].label).toBe('Spanish')
		expect(targetChoices([{ ...target('ES', '', true), language_label: '' }])[0].label).toBe('ES')
	})

	it('offers a placeholder before Relay has answered', () => {
		expect(targetChoices([])[0].id).toBe(NO_TARGETS)
	})
})

describe('targetSignature', () => {
	it('ignores state that does not change the dropdown', () => {
		const flipped = targets.map((entry) => ({ ...entry, enabled: !entry.enabled, live: false }))
		expect(targetSignature(flipped)).toBe(targetSignature(targets))
	})

	it('changes when a target is added, removed or relabelled', () => {
		expect(targetSignature(targets.slice(0, 1))).not.toBe(targetSignature(targets))
		expect(targetSignature([target('ES', 'Español', true), targets[1]])).not.toBe(targetSignature(targets))
	})
})

describe('resolveEnabled', () => {
	it('does not need the current value to enable or disable', () => {
		expect(resolveEnabled('enable', undefined)).toBe(true)
		expect(resolveEnabled('disable', undefined)).toBe(false)
	})

	it('inverts the cached value on a toggle', () => {
		expect(resolveEnabled('toggle', true)).toBe(false)
		expect(resolveEnabled('toggle', false)).toBe(true)
	})

	it('refuses to guess a toggle it has no value for', () => {
		expect(resolveEnabled('toggle', undefined)).toBeNull()
	})
})

describe('soloPlan', () => {
	it('enables the chosen target and disables every other one', () => {
		expect(soloPlan(targets, 'FR')).toEqual([
			{ target: 'ES', enabled: false },
			{ target: 'FR', enabled: true },
		])
	})

	it('re-sends the state a target is already in, rather than trusting the cache', () => {
		expect(soloPlan(targets, 'ES')).toEqual([
			{ target: 'ES', enabled: true },
			{ target: 'FR', enabled: false },
		])
	})
})

describe('actions', () => {
	it('starts and stops', async () => {
		const instance = fakeInstance(statusWith())
		await instance.run('start_capture')
		await instance.run('stop_capture')
		expect(instance.sent.map((r) => r.path)).toEqual(['/api/admin/start', '/api/admin/stop'])
	})

	it('toggles capture from the cached running flag', async () => {
		const stopped = fakeInstance(statusWith({ running: false }))
		await stopped.run('toggle_capture')
		expect(stopped.sent[0].path).toBe('/api/admin/start')

		const running = fakeInstance(statusWith({ running: true }))
		await running.run('toggle_capture')
		expect(running.sent[0].path).toBe('/api/admin/stop')
	})

	it('will not toggle capture before the first status', async () => {
		const instance = fakeInstance(null)
		await instance.run('toggle_capture')
		expect(instance.sent).toEqual([])
		expect(instance.logs[0].level).toBe('error')
	})

	it('posts the enabled flag to the chosen target', async () => {
		const instance = fakeInstance(statusWith())
		await instance.run('set_target_enabled', { target: 'FR', mode: 'enable' })
		expect(instance.sent).toEqual([{ method: 'POST', path: '/api/admin/target/FR', body: { enabled: true } }])
	})

	it('toggles a target against its cached value', async () => {
		const instance = fakeInstance(statusWith())
		await instance.run('set_target_enabled', { target: 'ES', mode: 'toggle' })
		expect(instance.sent[0].body).toEqual({ enabled: false })
	})

	it('logs rather than guessing when the target is unknown', async () => {
		const instance = fakeInstance(statusWith({ targets: [] }))
		await instance.run('set_target_enabled', { target: 'ES', mode: 'toggle' })
		expect(instance.sent).toEqual([])
		expect(instance.logs[0].level).toBe('error')
	})

	it('solos one target with a call per target', async () => {
		const instance = fakeInstance(statusWith())
		await instance.run('solo_target', { target: 'FR' })
		expect(instance.sent).toEqual([
			{ method: 'POST', path: '/api/admin/target/ES', body: { enabled: false } },
			{ method: 'POST', path: '/api/admin/target/FR', body: { enabled: true } },
		])
	})

	it('refuses the placeholder target', async () => {
		const instance = fakeInstance(null)
		await instance.run('solo_target', { target: NO_TARGETS })
		await instance.run('set_target_enabled', { target: NO_TARGETS, mode: 'enable' })
		expect(instance.sent).toEqual([])
		expect(instance.logs.map((entry) => entry.level)).toEqual(['error', 'error'])
	})

	it('builds the dropdown from the live target list', async () => {
		const instance = fakeInstance(statusWith())
		const option = (instance.definitions.solo_target.options as { choices: { id: string }[] }[])[0]
		expect(option.choices.map((choice) => choice.id)).toEqual(['ES', 'FR'])
	})
})
