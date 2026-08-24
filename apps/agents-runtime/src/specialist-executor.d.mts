import type { SpecialistExecuteContext, TaskResult, WorkspaceScope } from './orchestration-worker.d.mts'

export interface RunSpecialistInput {
	profile: string
	permissions: string[]
	objective: string
	context: unknown
	completionCriteria: string[]
	scope: WorkspaceScope
	signal: AbortSignal
	onProgress: (summary: string, percent?: number) => void
}

export function createSpecialistExecutor(options: {
	runSpecialist: (input: RunSpecialistInput) => Promise<TaskResult | undefined>
	timeoutMs?: number
}): (context: SpecialistExecuteContext) => Promise<TaskResult>

export const UNCONFIGURED: string

/**
 * `resolveRunId` is required: a DispatchReceipt's `dispatchId` is explicitly
 * not a runId, so there is no safe default. `getRun` is typed loosely because
 * the runtime's own RunRecord carries an `unknown` result; the executor
 * validates the shape it needs and fails rather than recording a hollow result.
 */
export function createPollingSpecialistRunner(options: {
	dispatch?: (agent: any, request: any) => Promise<any>
	getRun?: (runId: string) => Promise<any>
	resolveRunId: (receipt: any) => string | undefined
	agent: unknown
	pollMs?: number
}): (input: RunSpecialistInput) => Promise<TaskResult>

export function createUnconfiguredSpecialistRunner(): (input: RunSpecialistInput) => Promise<TaskResult>
