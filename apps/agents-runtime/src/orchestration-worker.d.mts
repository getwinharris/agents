import type { FileOrchestrationStore } from './orchestration-store.mjs'

export interface WorkspaceScope {
	account: string
	workspaceScope: string
}

export interface TaskProgress {
	summary: string
	percent?: number | null
}

export interface TaskResult {
	summary: string
	evidence?: unknown[]
	artifacts?: unknown[]
	verification?: { state: string; reason?: string }
	contextUpdates?: unknown[]
}

export interface SpecialistExecuteContext {
	task: Record<string, unknown>
	scope: WorkspaceScope
	publishProgress: (progress: TaskProgress) => unknown
}

export interface OrchestrationWorkerOptions {
	store: FileOrchestrationStore
	execute: (context: SpecialistExecuteContext) => Promise<TaskResult | undefined>
	workerId?: string
	leaseMs?: number
	heartbeatMs?: number
	pollMs?: number
	maxAttempts?: number
	onError?: (cause: unknown) => void
}

export interface OrchestrationWorker {
	readonly workerId: string
	readonly running: boolean
	runOnce(): Promise<{ recovered: number; claimed: boolean; task: unknown }>
	start(): void
	stop(): Promise<void>
}

export function createOrchestrationWorker(options: OrchestrationWorkerOptions): OrchestrationWorker
