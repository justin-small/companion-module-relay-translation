import { InstanceBase, InstanceStatus, runEntrypoint, type SomeCompanionConfigField } from '@companion-module/base'
import { GetConfigFields, validateConfig, type RelayConfig } from './config.js'
import { RelayClient, RelayError } from './client.js'
import { StatusStream } from './stream.js'
import type { RelayStatus } from './types.js'

export class RelayInstance extends InstanceBase<RelayConfig> {
	config!: RelayConfig
	private client: RelayClient | null = null
	private stream: StatusStream | null = null

	async init(config: RelayConfig): Promise<void> {
		this.config = config
		this.applyConfig()
	}

	async destroy(): Promise<void> {
		this.teardown()
	}

	async configUpdated(config: RelayConfig): Promise<void> {
		this.config = config
		this.applyConfig()
	}

	getConfigFields(): SomeCompanionConfigField[] {
		return GetConfigFields()
	}

	/** The client the rest of the module talks to Relay through. */
	get api(): RelayClient | null {
		return this.client
	}

	/** The most recent status, or null before the first frame. */
	get status(): RelayStatus | null {
		return this.stream?.lastStatus ?? null
	}

	private teardown(): void {
		this.stream?.stop()
		this.stream = null
		this.client?.destroy()
		this.client = null
	}

	private applyConfig(): void {
		this.teardown()

		const problem = validateConfig(this.config)
		if (problem) {
			this.updateStatus(InstanceStatus.BadConfig, problem.message)
			return
		}

		this.client = new RelayClient(this.config)
		this.updateStatus(InstanceStatus.Connecting)

		this.stream = new StatusStream(this.client, {
			onStatus: (status) => this.handleStatus(status),
			onConnected: () => this.updateStatus(InstanceStatus.Ok),
			onDisconnected: (error, retryInMs) => this.handleDisconnect(error, retryInMs),
			log: (level, message) => this.log(level, message),
		})
		this.stream.start()
	}

	private handleStatus(_status: RelayStatus): void {
		// Variables and feedbacks hang off this in the issues that follow; the
		// stream already caches the status for them.
	}

	private handleDisconnect(error: RelayError, retryInMs: number): void {
		if (error.kind === 'auth') {
			// Retrying a rejected token just fails again on a timer, but the
			// operator still needs the connection to recover on its own once
			// they fix it, so the stream keeps trying and the status says why.
			this.updateStatus(InstanceStatus.AuthenticationFailure, 'Admin token rejected')
		} else {
			this.updateStatus(InstanceStatus.ConnectionFailure, error.message)
		}

		this.log('warn', `${error.message} — retrying in ${Math.round(retryInMs / 100) / 10}s`)
	}
}

runEntrypoint(RelayInstance, [])
