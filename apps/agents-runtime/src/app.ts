import { bapX } from '@bapX/runtime/routing'
import { Hono } from 'hono'
import path from 'node:path'
import { FileOrchestrationStore, OrchestrationAuthorizationError, OrchestrationConflictError } from './orchestration-store.mjs'
import { authorizeWorkspaceRuntimeRequest, type WorkspaceRuntimeAuthorization } from './runtime-policy.mjs'
import { deviceAuthorizationStatus, startOpenAIDeviceAuthorization, WorkspaceCredentialStore } from './provider-auth.mjs'

const app = new Hono<{ Variables: { workspaceAuthorization: WorkspaceRuntimeAuthorization } }>()

function authorization(context: any) {
  return authorizeWorkspaceRuntimeRequest({
    expectedToken: process.env.BAPX_RUNTIME_TOKEN,
    suppliedToken: context.req.header('x-bapx-runtime-token'),
    account: context.req.header('x-bapx-account'),
    workspaceScope: context.req.header('x-bapx-workspace-scope'),
  })
}
function store() {
  return new FileOrchestrationStore({ directory: process.env.BAPX_ORCHESTRATION_DIR || path.resolve('.agents/orchestration/tasks') })
}
function credentials() {
  return new WorkspaceCredentialStore({ directory: process.env.BAPX_PROVIDER_CREDENTIAL_DIR || path.resolve('.agents/credentials'), encryptionKey: process.env.BAPX_CREDENTIAL_ENCRYPTION_KEY })
}
function error(context: any, cause: unknown) {
  if (cause instanceof OrchestrationAuthorizationError) return context.json({ error: 'Not found' }, 404)
  if (cause instanceof OrchestrationConflictError) return context.json({ error: cause.message }, 409)
  return context.json({ error: cause instanceof Error ? cause.message : 'Invalid request' }, 400)
}

app.use('/api/orchestration/*', async (context, next) => {
  const scope = authorization(context)
  if (!scope) return context.json({ error: 'Unauthorized' }, 401)
  context.set('workspaceAuthorization', scope)
  return next()
})
app.get('/api/orchestration/tasks', (context) => context.json({ tasks: store().list(context.get('workspaceAuthorization')) }))
app.post('/api/orchestration/tasks', async (context) => {
  try { return context.json(store().create(context.get('workspaceAuthorization'), await context.req.json()), 202) }
  catch (cause) { return error(context, cause) }
})
app.get('/api/orchestration/tasks/:id', (context) => {
  try { const task = store().get(context.get('workspaceAuthorization'), context.req.param('id')); return task ? context.json(task) : context.json({ error: 'Not found' }, 404) }
  catch (cause) { return error(context, cause) }
})
app.post('/api/orchestration/tasks/:id/approval', async (context) => {
  try { const body = await context.req.json(); return context.json(store().approve(context.get('workspaceAuthorization'), context.req.param('id'), body.version, body.decision, body.actor)) }
  catch (cause) { return error(context, cause) }
})
app.post('/api/orchestration/tasks/:id/cancel', async (context) => {
  try { const body = await context.req.json(); return context.json(store().transition(context.get('workspaceAuthorization'), context.req.param('id'), body.version, 'cancelled')) }
  catch (cause) { return error(context, cause) }
})
app.post('/api/orchestration/tasks/:id/acknowledge', async (context) => {
  try { const body = await context.req.json(); return context.json(store().acknowledge(context.get('workspaceAuthorization'), context.req.param('id'), body.version)) }
  catch (cause) { return error(context, cause) }
})
app.post('/api/orchestration/provider-auth/openai-codex/device', async (context) => {
  try { return context.json(await startOpenAIDeviceAuthorization({ scope: context.get('workspaceAuthorization'), store: credentials() }), 202) }
  catch (cause) { return error(context, cause) }
})
app.get('/api/orchestration/provider-auth/openai-codex/device/:id', (context) => {
  const status = deviceAuthorizationStatus(context.get('workspaceAuthorization'), context.req.param('id'))
  return status ? context.json(status) : context.json({ error: 'Not found' }, 404)
})
app.route('/api', bapX())

export default app
