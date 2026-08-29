import {
  fauxAssistantMessage,
  fauxText,
  fauxThinking,
  fauxToolCall,
  registerFauxProvider,
} from '@earendil-works/pi-ai/compat'
import { type AgentRouteHandler, defineAgent, defineAgentProfile, defineTool, registerProvider } from '@bapX/runtime'
import * as v from 'valibot'
import path from 'node:path'
import { FileOrchestrationStore } from '../orchestration-store.mjs'
import { currentWorkspaceAuthorization, withWorkspaceAuthorization } from '../request-scope.mjs'
import { authorizeWorkspaceRuntimeRequest } from '../runtime-policy.mjs'
import { resolveOpenAICodexCredential, WorkspaceCredentialStore } from '../provider-auth.mjs'

export const route: AgentRouteHandler = async (context, next) => {
  const authorization = authorizeWorkspaceRuntimeRequest({
    expectedToken: process.env.BAPX_RUNTIME_TOKEN,
    suppliedToken: context.req.header('x-bapx-runtime-token'),
    account: context.req.header('x-bapx-account'),
    workspaceScope: context.req.header('x-bapx-workspace-scope'),
  })
  if (!authorization) return context.json({ error: 'Unauthorized' }, 401)
  return withWorkspaceAuthorization(authorization, next)
}

const research = defineAgentProfile({
  name: 'research',
  description: 'Read-only research and evidence gathering.',
  instructions: 'Research only the bounded objective. Do not mutate workspace or external state. Return sources and uncertainty.',
})
const engineering = defineAgentProfile({
  name: 'engineering',
  description: 'Project-scoped implementation specialist.',
  instructions: 'Implement only the bounded objective inside the authorized project. Never publish, deploy, or expand permissions.',
})
const verification = defineAgentProfile({
  name: 'verification',
  description: 'Independent read-only verification specialist.',
  instructions: 'Verify evidence and observable behavior. Do not modify the implementation under review.',
})

export default defineAgent(async ({ id }) => {
  let openAICredential
  if (process.env.BAPX_CREDENTIAL_ENCRYPTION_KEY) {
    const authorization = currentWorkspaceAuthorization()
    openAICredential = await resolveOpenAICodexCredential({
      scope: authorization,
      store: new WorkspaceCredentialStore({
        directory: process.env.BAPX_PROVIDER_CREDENTIAL_DIR || path.resolve('.agents/credentials'),
        encryptionKey: process.env.BAPX_CREDENTIAL_ENCRYPTION_KEY,
      }),
    })
  }
  if (openAICredential) {
    return {
      model: 'openai-codex/gpt-5.6-sol',
      providerAuth: { 'openai-codex': openAICredential.access },
      thinkingLevel: 'medium',
      instructions: 'Own the user conversation and operate only inside the gateway-authenticated workspace. Delegate bounded work to the least-privilege named specialist. A delegated background task is not complete until its structured evidence is independently verified.',
      subagents: [research, engineering, verification],
      tools: orchestrationTools(),
    }
  }
  const providerId = `bapx-bootstrap-${id.replace(/[^a-zA-Z0-9_-]/g, '-')}`
  const faux = registerFauxProvider({
    api: providerId,
    provider: providerId,
    models: [{ id: 'main', reasoning: true }],
    tokensPerSecond: 30,
  })
  registerProvider(providerId, { api: providerId, baseUrl: '' })

  const responses = []
  for (let index = 0; index < 500; index += 1) {
    responses.push(
      (context: { messages: Array<{ role: string; content: unknown }> }) => {
        const input = context.messages.at(-1)
        const text =
          input?.role === 'user'
            ? typeof input.content === 'string'
              ? input.content
              : Array.isArray(input.content)
                ? input.content
                    .map((block) =>
                      block && typeof block === 'object' && 'type' in block && block.type === 'text' && 'text' in block
                        ? String(block.text)
                        : '',
                    )
                    .join('')
                : ''
            : ''
        return fauxAssistantMessage(
          [
            fauxThinking('Confirming the customer-scoped runtime is available.'),
            fauxToolCall('workspace_status', { request: text.slice(0, 120) }),
          ],
          { stopReason: 'toolUse' },
        )
      },
      fauxAssistantMessage([
        fauxThinking('The protected workspace check completed.'),
        fauxText('Your bapX Agents workspace is connected. The main agent is streaming through the authenticated customer runtime.'),
      ]),
    )
  }
  faux.setResponses(responses)

  return {
    model: `${providerId}/main`,
    thinkingLevel: 'low',
    instructions: 'Own the user conversation and operate only inside the gateway-authenticated workspace. Delegate bounded work to the least-privilege named specialist. A delegated background task is not complete until its structured evidence is independently verified.',
    subagents: [research, engineering, verification],
    tools: orchestrationTools(),
  }
})

// Mirrors terminalStates in orchestration-store.mjs. Kept local because the
// store does not export it; if that list changes, this must follow.
const TERMINAL_STATES = new Set(['succeeded', 'failed', 'cancelled', 'expired'])

function orchestrationTools() {
  return [
      defineTool({
        name: 'workspace_status',
        description: 'Confirm that the authenticated customer workspace gateway is active.',
        input: v.object({ request: v.string() }),
        run: async () => ({ scoped: true, runtime: 'main' }),
      }),
      defineTool({
        name: 'submit_specialist_task',
        description: 'Durably submit bounded background work to a named least-privilege specialist and immediately return its task receipt.',
        input: v.object({
          sessionId: v.string(),
          profile: v.picklist(['research', 'engineering', 'verification']),
          objective: v.string(),
          completionCriteria: v.optional(v.array(v.string())),
          requiresApproval: v.optional(v.boolean()),
        }),
        run: async (input) => {
          const authorization = currentWorkspaceAuthorization()
          const store = new FileOrchestrationStore({
            directory: process.env.BAPX_ORCHESTRATION_DIR || path.resolve('.agents/orchestration/tasks'),
          })
          const task = store.create(authorization, input)
          return { taskId: task.id, state: task.state, profile: task.profile, version: task.version }
        },
      }),
      defineTool({
        name: 'collect_specialist_results',
        description:
          "Read back the results of specialist work dispatched earlier in this session, and report what is still running. Call this after submit_specialist_task to fold a specialist's findings into the conversation; a submission only returns a receipt, not an answer.",
        input: v.object({
          // Optional so the common case — "what came back?" — needs no bookkeeping
          // from the caller.
          taskIds: v.optional(v.array(v.string())),
        }),
        run: async ({ input }) => {
          const authorization = currentWorkspaceAuthorization()
          const store = new FileOrchestrationStore({
            directory: process.env.BAPX_ORCHESTRATION_DIR || path.resolve('.agents/orchestration/tasks'),
          })
          const wanted = input.taskIds?.length ? new Set(input.taskIds) : null
          const tasks = store.list(authorization).filter((task) => !wanted || wanted.has(task.id))

          const completed = []
          const pending = []
          for (const task of tasks) {
            if (!TERMINAL_STATES.has(task.state)) {
              pending.push({ taskId: task.id, profile: task.profile, state: task.state, objective: task.objective })
              continue
            }
            // A result already acknowledged has been folded into the conversation
            // once; returning it again would make the agent repeat itself.
            // acknowledge() records this as notification === 'acknowledged'.
            if (task.notification === 'acknowledged') continue
            completed.push({
              taskId: task.id,
              profile: task.profile,
              state: task.state,
              objective: task.objective,
              summary: task.result?.summary ?? null,
              evidence: task.result?.evidence ?? [],
              artifacts: task.result?.artifacts ?? [],
              verification: task.result?.verification ?? null,
              // Failure is reported, never silently dropped: an agent that cannot
              // see a failed specialist will confidently report success.
              failed: task.state !== 'succeeded',
              retryable: task.result?.retryable ?? false,
            })
            // Acknowledging is what makes collection idempotent. A conflict here
            // means another reader won the race, which is not an error for us.
            try {
              store.acknowledge(authorization, task.id, task.version)
            } catch {
              // Leave it for the next collect rather than failing the whole call.
            }
          }
          return { completed, pending, collected: completed.length, stillRunning: pending.length }
        },
      }),
  ]
}
