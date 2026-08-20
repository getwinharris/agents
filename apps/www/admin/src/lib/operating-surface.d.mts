export interface OperatingSurface {
  kind: 'admin' | 'agents'
  label: 'Admin' | 'Agents'
  projectScope: string
  showAdminPullRequests: boolean
  showMediaHub: boolean
}

export function resolveOperatingSurface(hostname: string): OperatingSurface
export const operatingSurface: OperatingSurface
