import { InstanceBase, InstanceStatus, runEntrypoint, type SomeCompanionConfigField } from '@companion-module/base'
import { GetConfigFields, validateConfig, type RelayConfig } from './config.js'
import { RelayClient, RelayError } from './client.js'

/** Shape of `GET /api/admin/state` — only the part this issue needs. */
interface RelayState {
	status?: { running?: boolean }
}

export class RelayInstance extends InstanceBase<RelayConfig> {
	config!: RelayConfig
	private client: RelayClient | null = null

	async init(config: RelayConfig): Promise<void> {
		this.config = config
		await this.applyConfig()
	}

	async destroy(): Promise<void> {
		this.closeClient()
	}

	async configUpdated(config: RelayConfig): Promise<void> {
		this.config = config
		await this.applyConfig()
	}

	getConfigFields(): SomeCompanionConfigField[] {
		return GetConfigFields()
	}

	/** The client the rest of the module talks to Relay through. */
	get api(): RelayClient | null {
		return this.client
	}

	private closeClient(): void {
		this.client?.destroy()
		this.client = null
	}

	private async applyConfig(): Promise<void> {
		this.closeClient()

		const problem = validateConfig(this.config)
		if (problem) {
			this.updateStatus(InstanceStatus.BadConfig, problem.message)
			return
		}

		this.client = new RelayClient(this.config)
		this.updateStatus(InstanceStatus.Connecting)

		await this.probe()
	}

	/**
	 * One authenticated request, so a wrong token or an unreachable host is
	 * reported now rather than the first time an operator presses a button.
	 */
	private async probe(): Promise<void> {
		const client = this.client
		if (!client) return

		try {
			await client.request<RelayState>({ method: 'GET', path: '/api/admin/state', timeout: 5000 })
			if (this.client !== client) return // config changed under us
			this.updateStatus(InstanceStatus.Ok)
		} catch (error) {
			if (this.client !== client) return
			this.reportError(error)
		}
	}

	/** Map a failure onto an instance status. Never surfaces the request itself. */
	reportError(error: unknown): void {
		const relayError =
			error instanceof RelayError ? error : new RelayError('connection', error instanceof Error ? error.message : '')

		switch (relayError.kind) {
			case 'auth':
				this.updateStatus(InstanceStatus.AuthenticationFailure, 'Admin token rejected')
				break
			case 'tls':
			case 'connection':
				this.updateStatus(InstanceStatus.ConnectionFailure, relayError.message)
				break
			default:
				this.updateStatus(InstanceStatus.UnknownError, relayError.message)
				break
		}

		this.log('error', relayError.message)
	}
}

runEntrypoint(RelayInstance, [])
