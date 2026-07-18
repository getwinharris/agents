export function resolveOperatingSurface(hostname) {
  if (hostname === 'agents.bapx.in') {
    return {
      kind: 'agents',
      label: 'Agents',
      projectScope: 'your business workspace',
      showAdminPullRequests: false,
    }
  }

  return {
    kind: 'admin',
    label: 'Admin',
    projectScope: 'projects in /root/bapx.in',
    showAdminPullRequests: true,
  }
}

export const operatingSurface = resolveOperatingSurface(globalThis.location?.hostname ?? '')
