export function isAuthorizedRuntimeRequest(expected, supplied) {
  return Boolean(expected) && supplied === expected
}

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export function authorizeWorkspaceRuntimeRequest({
  expectedToken,
  suppliedToken,
  account,
  workspaceScope,
}) {
  if (!isAuthorizedRuntimeRequest(expectedToken, suppliedToken)) return null
  if (typeof account !== 'string' || !slugPattern.test(account)) return null
  if (typeof workspaceScope !== 'string') return null
  const match = /^users\/([^/]+)\/([^/]+)$/.exec(workspaceScope)
  if (!match || match[1] !== account || !slugPattern.test(match[2])) return null
  return Object.freeze({ account, business: match[2], workspaceScope })
}

export function authorizeWorkspaceVerificationRequest({ submitted, ...request }) {
  const authorization = authorizeWorkspaceRuntimeRequest(request)
  if (!authorization || !submitted || typeof submitted !== 'object') return null
  if (submitted.account !== authorization.account) return null
  if (submitted.workspaceScope !== authorization.workspaceScope) return null
  return authorization
}
