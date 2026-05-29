---
title: Routing
description: Expose agents and workflows over HTTP or WebSockets inside an authenticated application.
---

Routing is the application boundary between callers and Flue execution. Choose a transport according to the lifecycle you intend to expose, then authorize the identity that transport selects:

- expose an **agent instance** when callers should continue interacting with persistent sessions;
- expose a **workflow** when callers should start one finite, inspectable operation;
- accept an application-owned event and call **`dispatch(...)`** when an inbound webhook, queue consumer, or chat adapter should deliver asynchronous input to an agent session.

This guide shows how to enable those surfaces intentionally, compose them into an authenticated TypeScript application, and keep instance, session, dispatch, and workflow-run identities separate. For the underlying concepts, see [Agents](/docs/concepts/agents/), [Workflows](/docs/guide/workflows/), and [Observability](/docs/guide/observability/).

## Choose an exposed surface

Start by choosing the root lifecycle your application needs. Do not select a workflow merely because an agent performs model work, and do not expose a direct agent prompt route when the application should own inbound normalization or authorization.

| Caller need | Surface to expose | Identity selected by the caller or application | Completion model | Workflow run history? |
| --- | --- | --- | --- | --- |
| Continue a conversation or stateful assistant instance | Direct agent HTTP or agent WebSocket | Agent name, instance `id`, and optional session name | One attached prompt at a time per session | No |
| Start a bounded job and inspect its outcome | Workflow HTTP or workflow WebSocket | Workflow name; Flue creates a `runId` | One finite invocation | Yes |
| Deliver a verified webhook, platform event, or queued message into continuing agent state | Application route that calls `dispatch(...)` | Application chooses agent, instance `id`, and session | Admission receipt, then asynchronous processing | No |

A useful rule is:

```text
Caller is talking to a stable agent instance       → agent HTTP or WebSocket
Caller is starting one finite, observable job       → workflow HTTP or WebSocket
Your application received an event for an agent     → verify, normalize, authorize, then dispatch(...)
```

A workflow can initialize agents and use their sessions internally. That work remains nested in one workflow run. Conversely, a direct or dispatched prompt can perform many model turns and tool calls without becoming a run.

## Expose only the transports you intend to publish

Discovery and transport exposure are separate. In the `.flue/` layout, an agent module is discovered from `.flue/agents/<name>.ts`, and a workflow is discovered from `.flue/workflows/<name>.ts`. See [Project Layout](/docs/guide/project-layout/) for the equivalent root layout and discovery rules.

| Module | Required export | Optional transport export | Exposed endpoint when middleware continues |
| --- | --- | --- | --- |
| Agent module | Default-exported `createAgent(...)` value | `route` | `POST /agents/:name/:id` |
| Agent module | Default-exported `createAgent(...)` value | `websocket` | WebSocket upgrade at `GET /agents/:name/:id` |
| Workflow module | `run(...)` | `route` | `POST /workflows/:name` |
| Workflow module | `run(...)` | `websocket` | WebSocket upgrade at `GET /workflows/:name` |

A discovered module without a `route` or `websocket` export is not reachable through that public transport. This lets an application keep an agent available for `dispatch(...)`, or keep a workflow available for local invocation, without creating an inbound prompt endpoint.

### Expose an agent deliberately

```ts title=".flue/agents/support-assistant.ts"
import { createAgent, type AgentRouteHandler, type AgentWebSocketHandler } from '@flue/runtime';
import { authenticate } from '../auth.ts';

export const route: AgentRouteHandler = async (c, next) => {
  const principal = await authenticate(c.req.header('authorization'));
  const instanceId = c.req.param('id');

  if (!principal) return c.json({ error: 'Unauthorized' }, 401);
  if (!principal.agentInstanceIds.includes(instanceId)) return c.notFound();

  await next();
};

export const websocket: AgentWebSocketHandler = async (c, next) => {
  const principal = await authenticate(c.req.header('authorization'));
  const instanceId = c.req.param('id');

  if (!principal) return c.json({ error: 'Unauthorized' }, 401);
  if (!principal.agentInstanceIds.includes(instanceId)) return c.notFound();

  await next();
};

export default createAgent(({ id }) => ({
  model: 'anthropic/claude-haiku-4-5',
  instructions: `Assist only with the authorized support instance ${id}.`,
}));
```

The URL `:id` is a caller-selected agent instance identity. Authentication alone is not sufficient: the middleware must also authorize that the caller is allowed to act on that instance. If the request selects a session, apply the same reasoning to its session scope.

### Expose a workflow deliberately

```ts title=".flue/workflows/summarize-ticket.ts"
import { createAgent, type FlueContext, type WorkflowRouteHandler, type WorkflowWebSocketHandler } from '@flue/runtime';
import { authenticate } from '../auth.ts';

const summarizer = createAgent(() => ({
  model: 'anthropic/claude-haiku-4-5',
}));

export const route: WorkflowRouteHandler = async (c, next) => {
  const principal = await authenticate(c.req.header('authorization'));
  if (!principal) return c.json({ error: 'Unauthorized' }, 401);
  await next();
};

export const websocket: WorkflowWebSocketHandler = async (c, next) => {
  const principal = await authenticate(c.req.header('authorization'));
  if (!principal) return c.json({ error: 'Unauthorized' }, 401);
  await next();
};

export async function run({ init, payload }: FlueContext<{ ticketText: string }>) {
  const harness = await init(summarizer);
  const session = await harness.session();
  const response = await session.prompt(`Summarize this ticket:\n\n${payload.ticketText}`);
  return { summary: response.text };
}
```

The exported middleware is the admission boundary for that named transport. It can authenticate, verify application policy, or reject before calling `next()`. A TypeScript payload type does not validate untrusted request bodies at runtime; validate incoming payloads in middleware or in trusted workflow code when your application depends on their shape.

## Use the default application or compose your own

When a project does not provide `app.ts`, the generated application mounts `flue()` at `/`. Only transports enabled by module exports are invocable, while the public routing and workflow observation surfaces are available at their root paths.

| Default public path | Purpose |
| --- | --- |
| `POST /agents/:name/:id` | Prompt an HTTP-exposed agent instance. |
| `GET /agents/:name/:id` with WebSocket upgrade | Connect to a WebSocket-exposed agent instance. |
| `POST /workflows/:name` | Invoke an HTTP-exposed workflow. |
| `GET /workflows/:name` with WebSocket upgrade | Connect to a WebSocket-exposed workflow. |
| `GET /runs/:runId` | Read one workflow run record. |
| `GET /runs/:runId/events` | Read persisted workflow run events. |
| `GET /runs/:runId/stream` | Stream workflow run history and live completion. |
| `GET /openapi.json` | Read the public HTTP API description. |

The default mount is convenient for development and for applications whose per-agent or per-workflow exported middleware is sufficient. If run records or OpenAPI output must also be authenticated, or if you need application-owned ingress routes, compose a custom application instead.

### Mount authenticated Flue routes at the root

An authored `app.ts` owns the complete request pipeline. Import `flue()` from `@flue/runtime/app`, add the application middleware you require, and mount the Flue sub-application explicitly. If your app imports `Hono`, include `hono` as an application dependency.

Keeping Flue at the root preserves the default SDK HTTP paths:

```ts title=".flue/app.ts"
import { flue } from '@flue/runtime/app';
import { Hono, type MiddlewareHandler } from 'hono';
import { requireAuthenticatedUser, requireAccessibleRun } from './auth.ts';

const requireUser: MiddlewareHandler = async (c, next) => {
  const principal = await requireAuthenticatedUser(c.req.raw);
  if (!principal) return c.json({ error: 'Unauthorized' }, 401);
  await next();
};

const requireRunViewer: MiddlewareHandler = async (c, next) => {
  const permitted = await requireAccessibleRun(c.req.raw, c.req.param('runId'));
  if (!permitted) return c.notFound();
  await next();
};

const app = new Hono();

app.use('/agents/*', requireUser);
app.use('/workflows/*', requireUser);
app.use('/runs/:runId', requireRunViewer);
app.use('/runs/:runId/*', requireRunViewer);
app.route('/', flue());

export default app;
```

This outer middleware protects the mounted public families, including workflow observation. Keep the module-level agent middleware as well when access depends on the selected agent instance or session; a broad authenticated mount cannot by itself determine that `customer-123` may access only `/agents/support/customer-123`.

A `runId` is a correlation identity, not an authorization grant. If end users can invoke workflows, enforce the matching read policy on `/runs/:runId`, `/runs/:runId/events`, and `/runs/:runId/stream`, or expose those endpoints only to a trusted backend that performs that check.

### Mount beneath a prefix and add application routes

Mount under a prefix when the Flue API is one part of a larger service or when your application has separate internal and public ingress:

```ts title=".flue/app.ts"
import { flue } from '@flue/runtime/app';
import { Hono, type MiddlewareHandler } from 'hono';
import { requireApiUser, verifyWebhook } from './auth.ts';
import moderator from './agents/moderator.ts';
import { dispatch } from '@flue/runtime';

const authenticateApi: MiddlewareHandler = async (c, next) => {
  const principal = await requireApiUser(c.req.raw);
  if (!principal) return c.json({ error: 'Unauthorized' }, 401);
  await next();
};

const app = new Hono();

app.use('/api/*', authenticateApi);
app.route('/api', flue());

app.post('/webhooks/moderation', async (c) => {
  const event = await verifyWebhook(c.req.raw);
  const receipt = await dispatch(moderator, {
    id: event.workspaceId,
    session: event.caseId,
    input: { type: 'moderation.flagged', caseId: event.caseId, text: event.text },
  });
  return c.json(receipt, 202);
});

export default app;
```

With this composition, the mounted paths become `/api/agents/:name/:id`, `/api/workflows/:name`, `/api/runs/:runId`, and `/api/openapi.json`. Application-owned `/webhooks/moderation` is not an agent prompt route: it verifies a provider event and dispatches normalized input to an agent session.

The current SDK provides configurable WebSocket and admin mount paths, but its ordinary `client.agents.invoke(...)` and `client.runs.*` HTTP helpers request root `/agents/...` and `/runs/...` paths. For a prefixed `flue()` HTTP mount, call it with `fetch`, keep an unprefixed authenticated mount for those SDK helpers, or provide a reverse-proxy mapping that exposes their expected paths.

Use [Configuration](/docs/guide/configuration/) to select Node or Cloudflare build targets; runtime middleware and mounts belong in `app.ts`, not in `flue.config.ts`. Continue to [Build & Deploy](/docs/guide/deployment/) to verify the published surface and choose a target-specific Ecosystem deployment page.

## Expose direct agent interactions over HTTP

Direct agent HTTP is for one attached interaction against a stable agent instance and session. Enable it with an agent module `route` export, then send:

```http title="Prompt the default session of one agent instance"
POST /agents/support-assistant/customer-123 HTTP/1.1
Authorization: Bearer <token>
Content-Type: application/json

{"message":"Where is my order?"}
```

The request body is:

| Field | Required | Meaning |
| --- | ---: | --- |
| `message` | Yes | Text input to process as the next prompt. |
| `session` | No | Non-empty session name within the instance; defaults to `"default"`. |

The path and body choose persistent scope:

```text
agent: support-assistant
  instance id: customer-123
    harness: default
      session: default or caller-selected session
        operation: this prompt
```

Reusing the same agent name, `id`, and session continues that session when its configured persistence permits it. On Node, the default session storage is process-lifetime memory unless your created agent supplies persistence. On Cloudflare, the generated durable agent runtime retains session state across requests. See [Agents](/docs/guide/building-agents/) and [Sandboxes](/docs/guide/sandboxes/) when state or execution environment affects your exposure decision.

### Receive a synchronous result

Without an SSE `Accept` header, the HTTP request stays attached until its prompt operation completes and responds with JSON:

```http title="Prompt a named session synchronously"
POST /agents/support-assistant/customer-123 HTTP/1.1
Authorization: Bearer <token>
Content-Type: application/json

{"message":"Continue the returns case.","session":"case-8472"}
```

```json title="Response"
{
  "result": {
    "text": "...",
    "usage": {},
    "model": { "id": "..." }
  }
}
```

The exact `result` is produced by the agent operation. The response does not contain a `runId` and is not recorded in workflow run history.

### Stream an attached prompt with SSE

Request `text/event-stream` when an interactive HTTP client should receive progress while that prompt is attached:

```http title="Stream one direct agent prompt"
POST /agents/support-assistant/customer-123 HTTP/1.1
Authorization: Bearer <token>
Content-Type: application/json
Accept: text/event-stream

{"message":"Investigate this report.","session":"case-8472"}
```

The stream emits attached agent events, such as text deltas, tool activity, operation activity, and a final `idle` event. Events correlate to the stable `instanceId`, and session-derived events can identify their session. They deliberately do not contain workflow `runId`, `run_start`, or `run_end` fields.

If processing fails after streaming begins, the stream can terminate with an `error` event carrying the `instanceId` and a public error envelope. Handle that as failure of this attached interaction, not as a failed workflow run.

### Keep direct-agent authorization scoped correctly

The direct route is powerful: it lets a caller choose both a durable agent instance identity in the URL and, optionally, a conversation session in the body. Before continuing to the handler:

1. authenticate the caller;
2. validate or derive the allowed instance ID rather than trusting arbitrary path selection;
3. authorize session names if sessions represent threads, cases, tenants, or other protected scopes;
4. restrict tools and sandbox capabilities available to an externally promptable agent;
5. avoid accepting overlapping operations in the same session.

Flue enforces one active prompt for the same direct agent instance and session at a time. Structure clients to await completion before issuing another prompt to the same session, or deliberately use separate sessions for independent conversations.

Direct HTTP is not the appropriate public endpoint for a signed webhook or platform event whose payload must be normalized first. Use an application route and `dispatch(...)` for that boundary.

## Expose finite workflows over HTTP

Workflow HTTP is for finite jobs whose admission and outcome should be inspectable as a workflow run. Enable it with a workflow `route` export, then submit a JSON payload to:

```http title="Start a workflow run"
POST /workflows/summarize-ticket HTTP/1.1
Authorization: Bearer <token>
Content-Type: application/json

{"ticketText":"The customer cannot reset their password."}
```

Every admitted workflow invocation receives a new `runId`. Within `run(...)`, `ctx.id` is that same `runId`. Choose an observation mode according to how long the caller should stay attached.

| Mode | Request | Response | Use when |
| --- | --- | --- | --- |
| Accepted, default | Ordinary `POST` | `202` with `{ "status": "accepted", "runId": "..." }` | A caller submits work and observes it separately. |
| Wait for result | Add `?wait=result` | `200` JSON containing `result` and `_meta.runId` | The operation is bounded and the caller can remain connected. |
| Stream newly started run | Set `Accept: text/event-stream` without `?wait=result` | SSE lifecycle/events with `X-Flue-Run-Id` | A UI needs live progress as the job runs. |

### Submit work and inspect it later

```http title="Accepted workflow invocation"
POST /workflows/summarize-ticket HTTP/1.1
Authorization: Bearer <token>
Content-Type: application/json

{"ticketText":"The customer cannot reset their password."}
```

```http title="Accepted response"
HTTP/1.1 202 Accepted
X-Flue-Run-Id: workflow:summarize-ticket:...
Content-Type: application/json

{"status":"accepted","runId":"workflow:summarize-ticket:..."}
```

After admission, use the returned identity only on workflow-run endpoints authorized for that caller:

```http title="Read a workflow run record"
GET /runs/workflow%3Asummarize-ticket%3A... HTTP/1.1
Authorization: Bearer <token>
```

```http title="Read persisted workflow run events"
GET /runs/workflow%3Asummarize-ticket%3A.../events?after=10&limit=100 HTTP/1.1
Authorization: Bearer <token>
```

```http title="Replay and follow a workflow run stream"
GET /runs/workflow%3Asummarize-ticket%3A.../stream HTTP/1.1
Authorization: Bearer <token>
Accept: text/event-stream
```

`/runs/:runId/stream` replays persisted events and tails an active run until completion. SSE clients can reconnect with `Last-Event-ID` to resume after the last observed indexed event. `/runs/:runId/events` supports pagination-style reading with `after`, `limit`, and optionally comma-separated `types` filtering.

### Wait for the workflow result

```http title="Wait for one workflow result"
POST /workflows/summarize-ticket?wait=result HTTP/1.1
Authorization: Bearer <token>
Content-Type: application/json

{"ticketText":"The customer cannot reset their password."}
```

```json title="Completed workflow result envelope"
{
  "result": { "summary": "..." },
  "_meta": { "runId": "workflow:summarize-ticket:..." }
}
```

The result response also carries `X-Flue-Run-Id`. Waiting changes only how the initiating caller observes the invocation; this is still a workflow run and remains inspectable through its run routes.

### Stream the newly admitted workflow

```http title="Start and stream one workflow"
POST /workflows/summarize-ticket HTTP/1.1
Authorization: Bearer <token>
Content-Type: application/json
Accept: text/event-stream

{"ticketText":"The customer cannot reset their password."}
```

Workflow streams include lifecycle events such as `run_start` and `run_end`, together with any nested agent operations, tool activity, and structured workflow logs. Unlike a direct agent SSE stream, workflow events correlate through a `runId` and may later be replayed from persisted run history. See [Observability](/docs/guide/observability/) for event contents and sensitive-data handling.

## Use WebSockets for interactive attached delivery

A WebSocket uses the same exposure rule as HTTP, but is enabled independently through a `websocket` export. Exporting only `websocket` does not expose HTTP `POST`; exporting only `route` does not admit WebSocket connections.

| WebSocket surface | Upgrade path | Client messages | Lifetime and identity |
| --- | --- | --- | --- |
| Agent socket | `GET /agents/:name/:id` | Sequential `prompt` messages, with optional `session`, and `ping` | Stays connected for prompts against one stable agent instance; no workflow runs. |
| Workflow socket | `GET /workflows/:name` | One `invoke` message with optional payload | Carries one finite workflow invocation; events and result contain its `runId`, then the socket closes. |

### Connect to a continuing agent instance

```ts title="Connect to an agent with @flue/sdk"
import { createFlueClient } from '@flue/sdk';

const client = createFlueClient({
  baseUrl: 'https://service.example',
  websocketUrl: (url) => {
    url.searchParams.set('ticket', socketTicket);
    return url;
  },
});

const socket = client.agents.connect('support-assistant', 'customer-123');
await socket.ready;

const unsubscribe = socket.onEvent((event) => {
  renderAgentProgress(event);
});

const first = await socket.prompt('Help me return an item.', { session: 'returns' });
const second = await socket.prompt('Use the same case context.', { session: 'returns' });

unsubscribe();
socket.close();
```

`client.agents.connect(name, id)` connects to a WebSocket-exposed agent. Each `prompt(...)` is an attached operation in the selected session. It returns `{ result }`, and its events carry `instanceId`, not `runId`. Issue operations sequentially within a session; the persistent connection does not make concurrent work in one session safe.

### Connect to one workflow invocation

```ts title="Connect to a workflow with @flue/sdk"
import { createFlueClient } from '@flue/sdk';

const client = createFlueClient({
  baseUrl: 'https://service.example',
  websocketUrl: (url) => {
    url.searchParams.set('ticket', socketTicket);
    return url;
  },
});

const socket = client.workflows.connect('summarize-ticket');
await socket.ready;

const unsubscribe = socket.onEvent((event, context) => {
  renderWorkflowProgress(context.runId, event);
});

const completed = await socket.invoke({ ticketText: 'The customer cannot reset their password.' });
const run = await client.runs.get(completed.runId);

unsubscribe();
socket.close();
```

`client.workflows.connect(name)` is supported for WebSocket-exposed workflows. One socket accepts one `invoke(...)` call only. That invocation returns `{ result, runId }`; it is a normal workflow run and its record and event history can be inspected afterward.

### Authenticate WebSocket upgrades separately

WebSocket authorization occurs during the initial HTTP upgrade. A module `websocket` export or outer `app.ts` middleware can authenticate that request before accepting it:

```ts title=".flue/app.ts"
import { flue } from '@flue/runtime/app';
import { Hono, type MiddlewareHandler } from 'hono';
import { validateSocketTicket } from './auth.ts';

const authorizeSocket: MiddlewareHandler = async (c, next) => {
  const principal = await validateSocketTicket(c.req.query('ticket'));
  if (!principal) return c.json({ error: 'Unauthorized' }, 401);
  await next();
};

const app = new Hono();

app.use('/api/agents/*', authorizeSocket);
app.use('/api/workflows/*', authorizeSocket);
app.route('/api', flue());

export default app;
```

For this prefixed socket mount, configure the SDK's socket path explicitly:

```ts title="Connect through a prefixed authenticated socket mount"
const client = createFlueClient({
  baseUrl: 'https://service.example',
  websocketBasePath: '/api',
  websocketUrl: (url, target) => {
    url.searchParams.set('ticket', createSocketTicket(target));
    return url;
  },
});
```

Observe these boundaries:

- SDK `token` and `headers` options are used for its HTTP requests; they are not automatically applied to WebSocket upgrades.
- Browser WebSocket clients generally need cookies or application-designed URL-carried credentials, such as short-lived signed tickets.
- A Node client that requires custom upgrade headers can provide a custom SDK `websocket` factory.
- Authenticate and authorize instance selection at handshake time for agent sockets; later prompts continue within the already selected instance.
- On Cloudflare, treat authorization as a handshake boundary: original upgrade query parameters and headers are not restored into operation-time request context after Durable Object forwarding.
- Avoid response-header-mutating middleware around WebSocket upgrade routes, because upgrade responses may not permit those mutations.

If credentials are carried in a URL, prefer short-lived, narrowly scoped tickets and account for logging of request URLs in your infrastructure.

## Use the SDK only for its supported surfaces

`@flue/sdk` consumes deployed public surfaces. Its current helpers align with these lifecycle boundaries:

| SDK API | Supported use |
| --- | --- |
| `client.agents.invoke(name, id, { mode: 'sync', payload })` | Direct HTTP prompt returning `{ result }`. |
| `client.agents.invoke(name, id, { mode: 'stream', payload })` | Direct HTTP SSE prompt producing attached agent events without `runId`. |
| `client.agents.connect(name, id)` | WebSocket connection for sequential prompts on a stable agent instance. |
| `client.workflows.connect(name)` | WebSocket connection for one workflow invocation returning a `runId`. |
| `client.runs.get(runId)` | Read a workflow run record. |
| `client.runs.events(runId, options)` | Read workflow run events. |
| `client.runs.stream(runId, options)` | Replay/follow workflow run events with SSE reconnection support. |

There is currently no `client.workflows.invoke(...)` HTTP helper. Invoke an HTTP-exposed workflow with `fetch`, then use the run helpers with its returned `runId`:

```ts title="Invoke a workflow over HTTP and follow its run"
import { createFlueClient } from '@flue/sdk';

const token = await getAccessToken();
const response = await fetch('https://service.example/workflows/summarize-ticket', {
  method: 'POST',
  headers: {
    authorization: `Bearer ${token}`,
    'content-type': 'application/json',
  },
  body: JSON.stringify({ ticketText: 'The customer cannot reset their password.' }),
});

if (!response.ok) throw new Error(`Workflow admission failed: ${response.status}`);

const admission = await response.json() as { status: 'accepted'; runId: string };
const client = createFlueClient({ baseUrl: 'https://service.example', token });

for await (const event of client.runs.stream(admission.runId)) {
  renderWorkflowProgress(admission.runId, event);
}
```

Use the client HTTP authentication options for root-mounted Flue routes:

```ts title="Invoke an authenticated direct agent route"
import { createFlueClient } from '@flue/sdk';

const client = createFlueClient({
  baseUrl: 'https://service.example',
  token: await getAccessToken(),
});

const response = await client.agents.invoke('support-assistant', 'customer-123', {
  mode: 'sync',
  payload: { message: 'Where is my order?', session: 'orders' },
});
```

See the [SDK reference](/docs/sdk/overview/) for client types and individual method pages. Keep in mind that SDK convenience does not replace server-side authorization of caller-selected agent IDs, sessions, workflow access, or run records.

## Deliver application-owned inbound events with `dispatch(...)`

Use `dispatch(...)` after your application has accepted and interpreted an asynchronous inbound event. Typical sources include verified webhooks, chat adapters, event consumers, notification handlers, and application actions that should awaken a persistent agent session without keeping the caller attached.

Do not publish `dispatch(...)` as though it were another generic Flue HTTP route. Your route owns authentication, signature verification, replay handling, payload validation, normalization, tenant-to-instance mapping, and the response promised to the sender.

### Define a dispatch-only agent

An agent available to `dispatch(...)` does not need direct public prompt transports:

```ts title=".flue/agents/moderator.ts"
import { Type, createAgent, defineTool } from '@flue/runtime';
import { recordModerationDecision } from '../moderation.ts';

export default createAgent(({ id }) => ({
  model: 'anthropic/claude-haiku-4-5',
  instructions: `Process moderation events for authorized workspace ${id}.`,
  tools: [
    defineTool({
      name: 'record_moderation_decision',
      description: 'Record a moderation decision for the current workspace.',
      parameters: Type.Object({
        caseId: Type.String(),
        decision: Type.String(),
      }),
      execute: async ({ caseId, decision }) => {
        await recordModerationDecision(id, String(caseId), String(decision));
        return 'Decision recorded.';
      },
    }),
  ],
}));
```

This module has a default-exported created agent, so a built application can resolve it as a dispatch target. It has no `route` or `websocket` export, so callers cannot prompt it directly through those public transports.

### Verify, normalize, select identity, then dispatch

```ts title=".flue/app.ts"
import { dispatch } from '@flue/runtime';
import { flue } from '@flue/runtime/app';
import { Hono } from 'hono';
import moderator from './agents/moderator.ts';
import { parseVerifiedModerationEvent } from './moderation.ts';

const app = new Hono();

app.post('/webhooks/moderation', async (c) => {
  const event = await parseVerifiedModerationEvent(c.req.raw);
  const receipt = await dispatch(moderator, {
    id: event.workspaceId,
    session: event.caseId,
    input: {
      type: 'moderation.flagged',
      caseId: event.caseId,
      messageId: event.messageId,
      text: event.text,
    },
  });

  return c.json({ accepted: true, ...receipt }, 202);
});

app.route('/', flue());

export default app;
```

`dispatch(agent, request)` is preferable when application code imports the discovered default-exported created agent: it remains tied to that module identity if its file name changes. `dispatch({ agent: 'moderator', ... })` is also available when the application selects a registered agent name dynamically.

The request selects:

| Dispatch field | Purpose | Security guidance |
| --- | --- | --- |
| `id` | Target persistent agent instance. | Derive it from authenticated or verified application state, not model input or an untrusted arbitrary destination. |
| `session` | Target session inside the instance; defaults to `"default"`. | Use a verified thread/case/conversation key and enforce tenant ownership. |
| `input` | Structured inbound input recorded for processing. | Normalize it and include only data the agent needs; it must be JSON-serializable. |

The resolved created agent must be a discovered default export of the built application. Dispatch validates a non-empty target instance ID and session, requires an input payload, and snapshots JSON-serializable input at admission time.

### Interpret the receipt correctly

`dispatch(...)` resolves with an admission receipt:

```json title="Dispatch receipt"
{
  "dispatchId": "...",
  "acceptedAt": "2026-05-27T12:00:00.000Z"
}
```

A receipt means input was admitted for asynchronous processing. It is not the agent's result and does not promise that an external side effect, such as a sent reply or recorded action, has completed.

A dispatched input has `dispatchId`, agent instance identity, session identity, and operations as it is processed. It does **not** have a `runId`, does not create a workflow run record, and is not queried through `/runs` or `flue logs`. Use an `observe(...)` integration and your application data to correlate dispatched processing; [Chat](/docs/guide/chat/) shows this pattern for conversational integrations.

### Account for durability and side effects

Design asynchronous input around the guarantees of your deployment target:

| Target | Helpful high-level boundary |
| --- | --- |
| Node.js | Dispatch admission is process-memory based in the current generated runtime; accepted input can be lost if the process stops before it is processed. Use application-managed durable delivery when that is unacceptable. |
| Cloudflare | Dispatch processing uses the Durable Object-backed agent path and correlates durable delivery/session processing through `dispatchId`; still design external effects for at-least-once execution. |

Webhook providers can retry delivery, and durable or application-managed processing can retry after interruption. Use source event IDs, `dispatchId`, or an application idempotency record to avoid duplicate posts, mutations, payments, or notifications. Session persistence and outbound-effect idempotency are separate responsibilities.

## Protect optional administrative inspection routes

`flue()` does not automatically mount deployment-wide administrative listing routes. If an operator-facing service needs them, import and mount `admin()` separately behind stronger authorization:

```ts title=".flue/app.ts"
import { admin, flue } from '@flue/runtime/app';
import { Hono, type MiddlewareHandler } from 'hono';
import { requireOperator } from './auth.ts';

const operatorsOnly: MiddlewareHandler = async (c, next) => {
  const operator = await requireOperator(c.req.raw);
  if (!operator) return c.notFound();
  await next();
};

const app = new Hono();

app.route('/', flue());
app.use('/internal/flue/*', operatorsOnly);
app.route('/internal/flue', admin());

export default app;
```

Mounted at `/internal/flue`, the read-only admin sub-application provides:

| Admin path | Contents |
| --- | --- |
| `GET /internal/flue/agents` | Built agent manifest entries and their enabled transports; this is not a list of agent instances or sessions. |
| `GET /internal/flue/runs` | Paginated workflow runs across the deployment, optionally filtered by status or workflow name. |
| `GET /internal/flue/runs/:runId` | One workflow run record. |
| `GET /internal/flue/openapi.json` | Admin API description. |

Administrative run listing can reveal payloads, results, runtime activity, or deployment structure. Do not mount it as a general authenticated-user API unless that disclosure is part of your authorization model. The SDK exposes `client.admin.agents.list()`, `client.admin.runs.list()`, and `client.admin.runs.get()` only for an admin mount you intentionally publish and protect; configure `adminBasePath` when it is not `/admin`.

## Verify a routing design before deployment

Before exposing an authenticated application, check each route family against the intended lifecycle and identity boundary.

| Check | Correct outcome |
| --- | --- |
| Does each public agent module export only the required `route` and/or `websocket` transport? | Agents used only for inbound application events remain dispatch-only. |
| Does each public workflow export only required transports? | Every publicly invocable workflow represents an intentional finite run boundary. |
| Are direct agent path IDs and session names authorized? | A caller cannot target another tenant's or thread's persistent session. |
| Are workflow invocation and workflow-run reads protected consistently? | Knowing a `runId` does not bypass access policy. |
| Are socket credentials handled at upgrade time? | WebSocket authorization does not rely on HTTP SDK headers being forwarded automatically. |
| Are webhook inputs verified and normalized before dispatch? | Agents receive application-approved input and destinations only. |
| Are asynchronous external effects idempotent? | Retries do not create harmful duplicate effects. |
| Are admin routes omitted or separately operator-protected? | No unintended deployment-wide inspection surface exists. |
| Is observation aligned with identity? | Workflow work uses `runId`; direct/dispatched work uses instance, session, operation, and `dispatchId` identifiers. |

Continue with [Workflows](/docs/guide/workflows/) for finite orchestration, [Chat](/docs/guide/chat/) for application-owned conversational ingress, [Tools](/docs/guide/tools/) for capability authorization, [Observability](/docs/guide/observability/) for correlation and sensitive-event handling, and the [SDK reference](/docs/sdk/overview/) for supported client methods.
