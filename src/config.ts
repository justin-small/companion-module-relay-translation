import type { SomeCompanionConfigField } from '@companion-module/base'

export interface RelayConfig {
	host: string
}

export function GetConfigFields(): SomeCompanionConfigField[] {
	return [
		{
			type: 'textinput',
			id: 'host',
			label: 'Relay host',
			width: 8,
		},
	]
}

/** The module cannot talk to anything until it has at least a host. */
export function isConfigured(config: Partial<RelayConfig> | undefined): boolean {
	return !!config?.host?.trim()
}
