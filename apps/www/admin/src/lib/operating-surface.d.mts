export interface OperatingSurface {
  kind: 'admin' | 'agents'
  label: 'Admin' | 'Agents'
  projectScope: string
  showAdminPullRequests: boolean
}

export function resolveOperatingSurface(hostname: string): OperatingSurface
export const operatingSurface: OperatingSurface
