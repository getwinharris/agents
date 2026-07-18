export function isAuthorizedRuntimeRequest(expected, supplied) {
  return Boolean(expected) && supplied === expected
}
