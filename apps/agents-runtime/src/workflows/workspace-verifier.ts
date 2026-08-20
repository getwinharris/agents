import { defineWorkflow, type WorkflowRouteHandler } from '@bapX/runtime'
import * as v from 'valibot'
import mainAgent from '../agents/main.ts'
import { authorizeWorkspaceVerificationRequest } from '../runtime-policy.mjs'

const input = v.object({ account: v.string(), workspaceScope: v.string() })

export const route: WorkflowRouteHandler = async (context, next) => {
  let submitted: unknown
  try {
    submitted = await context.req.raw.clone().json()
  } catch {
    return context.json({ error: 'Invalid request' }, 400)
  }
  const authorization = authorizeWorkspaceVerificationRequest({
    expectedToken: process.env.BAPX_RUNTIME_TOKEN,
    suppliedToken: context.req.header('x-bapx-runtime-token'),
    account: context.req.header('x-bapx-account'),
    workspaceScope: context.req.header('x-bapx-workspace-scope'),
    submitted,
  })
  if (!authorization) return context.json({ error: 'Unauthorized' }, 401)
  return next()
}

export default defineWorkflow({
  agent: mainAgent,
  input,
  async run({ input: verified }) {
    return { verified: true, account: verified.account, workspaceScope: verified.workspaceScope, access: 'read-only' }
  },
})
