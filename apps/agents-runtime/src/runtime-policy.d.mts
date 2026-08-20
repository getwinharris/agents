export function isAuthorizedRuntimeRequest(expected: string | undefined, supplied: string | undefined): boolean

export interface WorkspaceRuntimeAuthorization {
  readonly account: string
  readonly business: string
  readonly workspaceScope: string
}

export function authorizeWorkspaceRuntimeRequest(input: {
  expectedToken: string | undefined
  suppliedToken: string | undefined
  account: string | undefined
  workspaceScope: string | undefined
}): WorkspaceRuntimeAuthorization | null

export function authorizeWorkspaceVerificationRequest(input: {
  expectedToken: string | undefined
  suppliedToken: string | undefined
  account: string | undefined
  workspaceScope: string | undefined
  submitted: unknown
}): WorkspaceRuntimeAuthorization | null
