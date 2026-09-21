import { InstanceBase, InstanceStatus, runEntrypoint, type SomeCompanionConfigField } from '@companion-module/base'
import { GetConfigFields, validateConfig, type RelayConfig } from './config.js'
import { RelayClient, RelayError, type RelayRequest } from './client.js'
import { StatusStream } from './stream.js'
import { UpdateActions, targetSignature } from './actions.js'
import type { RelayStatus } from './types.js'

export class RelayInstance extends InstanceBase<RelayConfig> {
	config!: RelayConfig
	private client: RelayClient | null = null
	private stream: StatusStream | null = null
	/** The target list the current action definitions were built from. */
	private targets = ''

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

	/**
	 * Fire a request at Relay and report a failure rather than throwing.
	 *
	 * Actions are fire-and-forget: nothing here touches cached state, because
	 * the truth comes back over the stream. What it must not do is swallow the
	 * error — a start refused for want of an API key is the likeliest failure
	 * of the night, and Relay's own wording is the useful part.
	 */
	async send(request: RelayRequest, description: string): Promise<void> {
		if (!this.client) {
			this.log('error', `${description} failed: not connected to Relay`)
			return
		}
		try {
			await this.client.request(request)
		} catch (error) {
			const message = error instanceof RelayError ? error.message : String(error)
			this.log('error', `${description} failed: ${message}`)
		}
	}

	private teardown(): void {
		this.stream?.stop()
		this.stream = null
		this.client?.destroy()
		this.client = null
	}

	private applyConfig(): void {
		this.teardown()
		// Rebuild from scratch: a new host has its own target list, and the
		// dropdown must not keep offering the old one.
		this.targets = ''
		UpdateActions(this)

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

	private handleStatus(status: RelayStatus): void {
		// Variables and feedbacks hang off this in the issues that follow; the
		// stream already caches the status for them.
		const signature = targetSignature(status.targets)
		if (signature !== this.targets) {
			this.targets = signature
			UpdateActions(this)
		}
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
