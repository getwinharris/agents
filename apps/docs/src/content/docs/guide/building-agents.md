---
title: Agents
description: Define an addressable agent, choose its continuing identity, and accept direct or asynchronous input.
---

An agent is the right application boundary when a model-driven assistant should continue receiving work under the same identity and session over time. This guide walks through defining an addressable agent module, configuring its runtime environment, exposing it for direct prompts, and dispatching application events into its continuing context.

If you are looking for the mental model first, start with [What is an agent?](/docs/concepts/agents/). To initialize a created agent from TypeScript as part of a finite operation, continue to [Workflows](/docs/guide/workflows/).

## Define an agent module

Put an addressable agent in the immediate `agents/` directory of your selected source layout. This guide uses `.flue/`; the equivalent root-level path is `agents/support-assistant.ts`.

```ts title=".flue/agents/support-assistant.ts"
import { createAgent, type AgentRouteHandler } from '@flue/runtime';

export const route: AgentRouteHandler = async (_c, next) => next();

export default createAgent(({ id }) => ({
  model: 'anthropic/claude-haiku-4-5',
  instructions: `Help with the support case represented by ${id}.`,
}));
```

This module does two things:

| Export | Purpose |
| --- | --- |
| `default createAgent(...)` | Makes the created agent discoverable as `support-assistant`. |
| `route` | Opts that agent into direct HTTP prompts at `POST /agents/support-assistant/:id`. |

The module filename chooses the **agent name**. The `id` passed to the initializer chooses an **agent instance** when direct or dispatched input targets the module. For example, the application might use `customer-123` or `ticket-8472` as an instance id.

An agent module does not need a `route` export. Omit it when application code will deliver input with `dispatch(...)` rather than exposing a direct prompt endpoint. Export `websocket` only when you intend to accept direct WebSocket interaction; see [Routing](/docs/guide/routing/) for transport and middleware details.

### Reuse a profile when behavior is shared

Use `defineAgentProfile(...)` when model-facing behavior should be shared by multiple created agents or workflows:

```ts title=".flue/agents/support-assistant.ts"
import { createAgent, defineAgentProfile, type AgentRouteHandler } from '@flue/runtime';

const support = defineAgentProfile({
  model: 'anthropic/claude-haiku-4-5',
  instructions: 'Help customers understand and resolve support cases.',
});

export const route: AgentRouteHandler = async (_c, next) => next();

export default createAgent(() => ({ profile: support }));
```

A profile configures reusable behavior and capabilities. A created agent binds that behavior to runtime concerns such as an instance-aware configuration, sandbox, working directory, or session store. Only the default-exported created agent becomes the discovered agent module.

## Configure the agent runtime

Runtime options that construct the agent's environment belong in `createAgent(...)`, not on the workflow code that may initialize it. This includes the working directory, sandbox, session store, and context-compaction settings:

```ts title=".flue/agents/repository-reviewer.ts"
import { createAgent } from '@flue/runtime';
import { local } from '@flue/runtime/node';
import { reviewerSessionStore } from '../shared/reviewer-session-store.ts';

export default createAgent(() => ({
  model: 'anthropic/claude-sonnet-4-6',
  instructions: 'Follow workspace guidance and review only the requested change.',
  sandbox: local(),
  cwd: '/srv/repositories/catalog-service',
  persist: reviewerSessionStore,
}));
```

| Configuration | Purpose |
| --- | --- |
| `sandbox` | Selects the filesystem and command-execution boundary for built-in agent capabilities. |
| `cwd` | Selects the workspace root inside that sandbox for relative paths and discovered context. |
| `persist` | Selects the `SessionStore` used for conversation history. |
| `compaction` | Tunes or disables proactive summarization of long session context. |

The `local()` example deliberately gives a Node-target agent host filesystem and shell access. Choose an isolated or platform-specific sandbox when that is a better boundary. See [Sandboxes](/docs/guide/sandboxes/) for available execution surfaces and [Data Persistence API](/docs/api/data-persistence-api/) for custom session-store contracts.

### Make runtime context available at initialization

When Flue initializes the configured agent environment, it constructs system context from the created-agent configuration and its sandbox working directory. Initialization combines:

1. Flue's headless-execution preamble;
2. `instructions` from the selected agent configuration or profile;
3. `<cwd>/AGENTS.md`, followed by `<cwd>/CLAUDE.md`, when present in the sandbox;
4. a catalog of workspace skills found under `<cwd>/.agents/skills/<name>/SKILL.md`; and
5. the current working directory and, when readable, its initial directory listing.

Agent instructions precede discovered workspace guidance. Workspace skill metadata is discovered at initialization and advertised to the model; skill content is loaded only when the skill is used. See [Skills](/docs/guide/skills/) for authoring workspace skills.

`cwd` is a runtime sandbox path, not the location from which Flue discovers authored modules. Files beside `.flue/agents/` or `.flue/workflows/` are not automatically available in an in-memory or remote runtime workspace. If a workflow creates `AGENTS.md`, `CLAUDE.md`, or workspace skills for an agent to use, it must stage them before initialization; see [Workflows](/docs/guide/workflows/).

## Choose instance and session identity

A direct agent URL selects an instance through its `id` segment:

```text
/agents/support-assistant/customer-123
                          └────────── instance id
```

The instance id should represent the stable application identity that owns continuing context or capabilities. Common choices include one customer, support ticket, repository, tenant, or chat thread.

Within one instance, sessions separate conversation threads:

```text
support-assistant / customer-123
  └─ harness "default"
      ├─ session "default"
      ├─ session "billing-case-42"
      └─ session "renewal-discussion"
```

Use one instance per larger identity and named sessions for its independent conversations, or use the conversation itself as the instance id when that is the authorization boundary. For direct HTTP, WebSocket, and dispatched input, Flue selects the created agent's default environment and uses the requested session or `"default"` when none is supplied.

### Manage stored sessions from code

When code has initialized a created agent and obtained its environment, its session collection lets you enforce lifecycle expectations for conversation state:

| Method | Use it when… | Behavior |
| --- | --- | --- |
| `harness.session(name?)` | You want to continue a named thread or start it if absent. | Gets or creates; defaults to `"default"`. |
| `harness.sessions.get(name?)` | Work must only continue an existing thread. | Throws if no stored session exists. |
| `harness.sessions.create(name?)` | Work must begin a new thread without overwriting an old one. | Throws if the session already exists. |
| `harness.sessions.delete(name?)` | Conversation state should be forgotten. | Deletes stored conversation state; missing sessions are ignored. |
| `session.delete()` | You already hold the session to remove. | Deletes that session's stored conversation state. |

Deleting a parent session also deletes its stored child task-session tree. It does not delete sandbox files or reverse external effects previously made by tools or commands.

### Choose session persistence deliberately

A session's stored state is its conversation history, recorded operations, task-session relationships, and compaction checkpoints. Conversation durability depends on the selected `SessionStore`:

| Configuration or target behavior | Conversation-state durability |
| --- | --- |
| Generated Node.js runtime with no `persist` override | In memory for the life of that server process. Restarts and independently scaled processes do not share it. |
| Generated Cloudflare runtime handling an agent through its Durable Object integration | Stored in Durable Object SQLite by default when Durable Object storage is available. |
| `persist` returned by `createAgent(...)` | Uses your `SessionStore` implementation instead of the target default. |

Conversation state, sandbox files, workflow-run history, and external changes are separate durability concerns. A durable session does not automatically make an ephemeral sandbox filesystem durable; a durable workspace does not preserve conversations unless the session store does. See [Sandboxes](/docs/guide/sandboxes/) and [Build & Deploy](/docs/guide/deployment/) before selecting a production boundary.

### Authorize caller-selected identities

If an agent has direct HTTP or WebSocket exposure, the caller selects `id`. Before continuing the request, verify that the caller is permitted to access that instance:

```ts title=".flue/agents/support-assistant.ts"
import { createAgent, type AgentRouteHandler } from '@flue/runtime';
import { authenticate } from '../auth.ts';

export const route: AgentRouteHandler = async (c, next) => {
  const principal = await authenticate(c.req.header('authorization'));
  const instanceId = c.req.param('id');

  if (!principal) return c.json({ error: 'Unauthorized' }, 401);
  if (!principal.supportCaseIds.includes(instanceId)) return c.notFound();

  await next();
};

export default createAgent(({ id }) => ({
  model: 'anthropic/claude-haiku-4-5',
  instructions: `Help with authorized support case ${id}.`,
}));
```

This matters especially when tools or environment resources are scoped using `id`. Do not allow an untrusted caller to select another customer's conversation or capabilities simply by changing the URL.

## Send direct prompts

An agent with a `route` export accepts one attached prompt at `POST /agents/<name>/<id>`. Send `message` and optionally select a session:

```http title="Prompt a support instance"
POST /agents/support-assistant/customer-123 HTTP/1.1
Authorization: Bearer <token>
Content-Type: application/json

{
  "message": "Can you summarize the open issues in my case?",
  "session": "billing-case-42"
}
```

If `session` is omitted, Flue uses the `"default"` session. This request targets:

```text
agent: support-assistant
  instance: customer-123
    harness: default
      session: billing-case-42
        operation: prompt
```

A synchronous prompt waits for its result:

```json title="Response"
{
  "result": {
    "text": "...",
    "usage": {},
    "model": { "id": "..." }
  }
}
```

This operation continues an agent session. It does not create a workflow run or produce a `runId`.

### Stream or connect interactively

Request `text/event-stream` from the HTTP endpoint when the client should observe activity while one attached prompt is running:

```http title="Stream a direct prompt"
POST /agents/support-assistant/customer-123 HTTP/1.1
Authorization: Bearer <token>
Content-Type: application/json
Accept: text/event-stream

{"message":"Investigate this report.","session":"billing-case-42"}
```

For a client that will send multiple prompts over one connection, add WebSocket exposure to the module:

```ts title=".flue/agents/support-assistant.ts"
import { type AgentWebSocketHandler } from '@flue/runtime';

export const websocket: AgentWebSocketHandler = async (_c, next) => next();
```

HTTP and WebSocket interactions target the same agent instance and named-session model. A WebSocket does not replace session identity or make an interaction a workflow run. See [Routing](/docs/guide/routing/) for secure exposure and [SDK](/docs/sdk/overview/) for client helpers.

## Accept asynchronous input with `dispatch(...)`

Use `dispatch(...)` when your application receives an event for an agent but the inbound request should not stay attached while model work completes. Examples include verified webhooks, queue messages, chat events, and application notifications.

```ts title=".flue/support-events.ts"
import { dispatch } from '@flue/runtime';
import supportAssistant from './agents/support-assistant.ts';

export async function acceptSupportComment(event: {
  customerId: string;
  caseId: string;
  commentId: string;
  text: string;
}) {
  return dispatch(supportAssistant, {
    id: event.customerId,
    session: event.caseId,
    input: {
      type: 'support.comment.created',
      commentId: event.commentId,
      text: event.text,
    },
  });
}
```

Here, the application selects the authorized target before the agent sees the input:

- `id` selects the continuing agent instance;
- `session` selects its conversation thread;
- `input` is JSON-serializable application data accepted for processing; and
- the returned receipt contains `dispatchId` and `acceptedAt`.

Dispatch returns admission information rather than an attached assistant response. It does not create a workflow run. Its delivery durability depends on the selected target and application delivery path; choose a durable delivery architecture when accepted work must survive restarts.

Keep inbound verification and outbound side effects at application-controlled boundaries. For example, a chat integration can verify a platform event, dispatch normalized text into a thread-scoped agent session, and expose a tool that can reply only to that authorized thread. See [Chat](/docs/guide/chat/) for that pattern.

## Compact long-running sessions

As a session accumulates messages and tool output, its active model context can approach the selected model's context window. **Compaction** summarizes older history while retaining recent context verbatim, then stores that summary in session history so later operations can continue with a shorter context.

Compaction maintains useful conversational continuity; it is not immutable archival storage. Preserve authoritative source material in files or application data when exact earlier detail matters.

With ordinary agent configuration, threshold-based compaction is enabled after an assistant response when reported context use approaches the model's context window minus output headroom:

| Setting | Default behavior |
| --- | --- |
| `reserveTokens` | Up to `20_000` tokens, reduced when the model's declared maximum output is smaller; tiny context windows receive an additional safety clamp. |
| `keepRecentTokens` | `8_000` recent tokens retained without summarization. |
| Summarization model | The session's active model. |

Threshold detection depends on usable model context-window metadata. Overflow recovery remains a fallback if a provider reports an overflow; provide accurate metadata for custom models as described in [Models & Providers](/docs/guide/models/).

Tune compaction on the created agent or reusable profile:

```ts title=".flue/agents/long-review.ts"
import { createAgent } from '@flue/runtime';

export default createAgent(() => ({
  model: 'anthropic/claude-sonnet-4-6',
  compaction: {
    reserveTokens: 24_000,
    keepRecentTokens: 10_000,
    model: 'anthropic/claude-haiku-4-5',
  },
}));
```

Call `session.compact()` when your application wants a checkpoint before continuing, such as between phases of long work:

```ts
await session.prompt('Inspect the evidence and record significant facts.');
await session.compact();
const recommendation = await session.prompt('Propose the final recommendation.');
```

`session.compact()` is a no-op when there is no valid older context to summarize. It is an exclusive session operation, so do not run it while a prompt, skill, task, or shell operation is in flight on the same session.

Set `compaction: false` only to disable proactive threshold summarization. Overflow recovery may still compact and retry, and an explicit `session.compact()` still compacts. If you require an exact immutable transcript, retain it outside the model's active conversation context.

Automatic and manual compaction use model calls and contribute usage and cost. See [Observability](/docs/guide/observability/) for compaction events and their relationship to agent operations or workflow runs.

## Choose agents or workflows deliberately

Use an agent when continuing identity and sessions are central to the product. Use a workflow when one finite invocation and its result or run history are central.

| Need | Choose | Identity and observation |
| --- | --- | --- |
| Continue a customer assistant or support case across interactions | Agent | Instance id and session; operations are not workflow runs. |
| Accept recurring events for one account, thread, or repository | Agent with `dispatch(...)` | `dispatchId`, instance, session, and operation events. |
| Summarize one document and return a result | Workflow | One `runId` and workflow run lifecycle. |
| Run an inspectable finite automation or pipeline | Workflow | One `runId`, stored result or failure, and run events. |

A workflow can initialize a created agent for model-driven steps during a run. That does not turn an addressable agent interaction into a workflow run: direct and dispatched inputs remain associated with an agent instance and its sessions.

## Next steps

- [Workflows](/docs/guide/workflows/) — initialize created agents and orchestrate sessions during a finite run.
- [Routing](/docs/guide/routing/) — expose agent HTTP and WebSocket surfaces inside an authenticated application.
- [Tools](/docs/guide/tools/) and [Sandboxes](/docs/guide/sandboxes/) — define what an agent can do and where built-in execution occurs.
- [Chat](/docs/guide/chat/) — deliver chat events asynchronously into continuing agent sessions.
- [Observability](/docs/guide/observability/) — correlate operations, dispatches, compaction, and workflow runs accurately.
