import { AsyncLocalStorage } from 'node:async_hooks'

const storage = new AsyncLocalStorage()
export function withWorkspaceAuthorization(authorization, operation) { return storage.run(authorization, operation) }
export function currentWorkspaceAuthorization() {
  const authorization = storage.getStore()
  if (!authorization) throw new Error('No authenticated workspace scope is active.')
  return authorization
}
