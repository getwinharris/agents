import { createBapxClient, type BapxClient } from '@bapX/sdk'
import type { Connection } from './types'

/** bapX Admin defaults to the business's main operating agent. */
export const DEFAULT_CONNECTION: Connection = {
  agentUrl: 'https://agents.bapx.in/api/agents/main',
  live: 'sse',
}

/**
 * Split an agent URL into the SDK base URL and the agent name. The agent path is
 * `<baseUrl>/agents/<name>/<id>`, so the name is the first segment after
 * `/agents/` and the base URL is everything before it.
 */
export function parseAgentUrl(agentUrl: string): { baseUrl: string; agentName: string } {
  const trimmed = agentUrl.trim().replace(/\/+$/, '')
  const marker = '/agents/'
  const index = trimmed.lastIndexOf(marker)
  if (index === -1) return { baseUrl: trimmed, agentName: '' }
  const baseUrl = trimmed.slice(0, index)
  const rest = trimmed.slice(index + marker.length)
  const [name = ''] = rest.split('/')
  return { baseUrl, agentName: decodeURIComponent(name) }
}

export function createClientFor(connection: Connection): BapxClient {
  return createBapxClient({
    baseUrl: parseAgentUrl(connection.agentUrl).baseUrl,
    token: connection.token?.trim() || undefined,
  })
}
