export const specialistProfiles: Readonly<Record<string, { readonly permissions: readonly string[] }>>
export class OrchestrationConflictError extends Error {}
export class OrchestrationAuthorizationError extends Error {}
export class FileOrchestrationStore {
  constructor(options: { directory: string; now?: () => Date })
  create(scope: any, input: any): any
  get(scope: any, taskId: string): any
  list(scope: any): any[]
  transition(scope: any, taskId: string, expectedVersion: number, state: string, details?: any): any
  approve(scope: any, taskId: string, expectedVersion: number, decision: string, actor: string): any
  claim(scope: any, taskId: string, expectedVersion: number, workerId: string, leaseMs?: number): any
  publishProgress(scope: any, taskId: string, expectedVersion: number, progress: any): any
  complete(scope: any, taskId: string, expectedVersion: number, result: any): any
  recoverExpiredLeases(scope: any): any[]
  acknowledge(scope: any, taskId: string, expectedVersion: number): any
}
