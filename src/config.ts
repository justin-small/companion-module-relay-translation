import type { SomeCompanionConfigField } from '@companion-module/base'

export interface RelayConfig {
	host: string
	port: number
	token: string
	https: boolean
	acceptSelfSigned: boolean
	fingerprint: string
}

export const DEFAULT_PORT = 8443

export function GetConfigFields(): SomeCompanionConfigField[] {
	return [
		{
			type: 'static-text',
			id: 'intro',
			width: 12,
			label: 'Relay',
			value:
				'Companion reaches Relay through Caddy on the HTTPS port — the admin socket itself is bound to loopback. ' +
				'The admin token is printed by Relay&apos;s setup script, along with the certificate fingerprint.',
		},
		{
			type: 'textinput',
			id: 'host',
			label: 'Host',
			tooltip: 'IP address or hostname of the Relay machine',
			width: 8,
			default: '',
		},
		{
			type: 'number',
			id: 'port',
			label: 'Port',
			width: 4,
			min: 1,
			max: 65535,
			default: DEFAULT_PORT,
		},
		{
			type: 'textinput',
			id: 'token',
			label: 'Admin token',
			tooltip: "The admin token set by Relay's setup script",
			width: 12,
			default: '',
		},
		{
			type: 'checkbox',
			id: 'https',
			label: 'Use HTTPS',
			tooltip: 'On for a normal Relay install. Off only for a same-host or reverse-proxied deployment.',
			width: 6,
			default: true,
		},
		{
			type: 'checkbox',
			id: 'acceptSelfSigned',
			label: 'Accept self-signed certificate',
			tooltip: 'Relay mints its own certificate per machine, so this is on by default.',
			width: 6,
			default: true,
		},
		{
			type: 'textinput',
			id: 'fingerprint',
			label: 'Certificate SHA-256 fingerprint (optional)',
			tooltip:
				'When set, the connection is pinned to this certificate and anything else is refused, ' +
				"even with the checkbox above on. Relay's setup script prints it.",
			width: 12,
			default: '',
		},
	]
}

/** Strip the colons and case that every tool prints fingerprints with differently. */
export function normaliseFingerprint(value: string): string {
	return value.replace(/[\s:]/g, '').toLowerCase()
}

export interface ConfigProblem {
	message: string
}

/** What is missing before the module can talk to Relay at all. */
export function validateConfig(config: Partial<RelayConfig> | undefined): ConfigProblem | null {
	if (!config?.host?.trim()) return { message: 'Set the Relay host' }
	if (!config.port || config.port < 1 || config.port > 65535) return { message: 'Set a valid port' }
	if (!config.token?.trim()) return { message: 'Set the admin token' }

	const fingerprint = normaliseFingerprint(config.fingerprint ?? '')
	if (fingerprint && !/^[0-9a-f]{64}$/.test(fingerprint)) {
		return { message: 'The certificate fingerprint is not a SHA-256 hash (64 hex characters)' }
	}

	return null
}
