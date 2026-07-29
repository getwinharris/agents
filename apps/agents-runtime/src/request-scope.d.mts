import type { WorkspaceRuntimeAuthorization } from './runtime-policy.mjs'
export function withWorkspaceAuthorization<T>(authorization: WorkspaceRuntimeAuthorization, operation: () => T): T
export function currentWorkspaceAuthorization(): WorkspaceRuntimeAuthorization
