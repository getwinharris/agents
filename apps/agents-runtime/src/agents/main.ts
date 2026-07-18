import {
  fauxAssistantMessage,
  fauxText,
  fauxThinking,
  fauxToolCall,
  registerFauxProvider,
} from '@earendil-works/pi-ai/compat'
import { type AgentRouteHandler, defineAgent, defineTool, registerProvider } from '@bapX/runtime'
import * as v from 'valibot'
import { isAuthorizedRuntimeRequest } from '../runtime-policy.mjs'

export const route: AgentRouteHandler = async (context, next) => {
  const expected = process.env.BAPX_RUNTIME_TOKEN
  const supplied = context.req.header('x-bapx-runtime-token')
  if (!isAuthorizedRuntimeRequest(expected, supplied)) return context.json({ error: 'Unauthorized' }, 401)
  return next()
}

export default defineAgent(({ id }) => {
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
    instructions: 'Operate only inside the workspace scope supplied by the authenticated bapX gateway.',
    tools: [
      defineTool({
        name: 'workspace_status',
        description: 'Confirm that the authenticated customer workspace gateway is active.',
        input: v.object({ request: v.string() }),
        run: async () => ({ scoped: true, runtime: 'main' }),
      }),
    ],
  }
})
