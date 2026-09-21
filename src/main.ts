import { InstanceBase, InstanceStatus, runEntrypoint, type SomeCompanionConfigField } from '@companion-module/base'
import { GetConfigFields, isConfigured, type RelayConfig } from './config.js'

export class RelayInstance extends InstanceBase<RelayConfig> {
	config!: RelayConfig

	async init(config: RelayConfig): Promise<void> {
		this.config = config
		this.applyConfig()
	}

	async destroy(): Promise<void> {
		this.log('debug', 'destroy')
	}

	async configUpdated(config: RelayConfig): Promise<void> {
		this.config = config
		this.applyConfig()
	}

	getConfigFields(): SomeCompanionConfigField[] {
		return GetConfigFields()
	}

	private applyConfig(): void {
		if (!isConfigured(this.config)) {
			this.updateStatus(InstanceStatus.BadConfig, 'Set the Relay host')
			return
		}

		// Connecting is issue #2 onwards; until then a configured instance is
		// deliberately inert rather than pretending to be Ok.
		this.updateStatus(InstanceStatus.Disconnected, 'Not implemented yet')
	}
}

runEntrypoint(RelayInstance, [])
