---
title: Routing API
description: Compose Bapx routes in an authored application entrypoint.
lastReviewedAt: 2026-06-20
---

Import application composition APIs from `@bapX/runtime/routing`.

## `app.ts`

`app.ts` is an optional authored application entrypoint. Without it, Bapx generates an application that mounts `bapX()` at `/`. When `app.ts` exists, its default export owns the request pipeline and must mount `bapX()` explicitly to publish Bapx routes.

```ts title="src/app.ts"
import { bapX } from '@bapX/runtime/routing';
import { Hono } from 'hono';

const app = new Hono();
app.route('/', bapX());
export default app;
```

See [Routing](/guide/routing/) for middleware, custom routes, prefixes, and application-owned dispatch.

#### `Fetchable`

```ts
interface Fetchable {
  fetch(request: Request, env?: unknown, ctx?: unknown): Response | Promise<Response>;
}
```

Structural contract for the default export of an authored `app.ts` entry. Any object exposing a compatible `fetch()` method satisfies it, including a `new Hono()` instance.

On Cloudflare, `env` contains bindings and `ctx` is the `ExecutionContext`. On Node, `env` contains Hono's Node adapter bindings for the incoming and outgoing messages, and `ctx` is `undefined`.

## `bapX()`

```ts
function bapX(): Hono;
```

Creates a mountable Hono sub-app for Bapx's public HTTP API. Routes are relative to the application-chosen mount prefix.

| Route                          | Purpose                                                                                  |
| ------------------------------ | ---------------------------------------------------------------------------------------- |
| `POST /agents/:name/:id`       | Start a prompt on an HTTP-exposed agent instance; returns `202` with stream coordinates. |
| `POST /agents/:name/:id/abort` | Abort the instance's in-flight and queued durable work; returns `200 { aborted }`.       |
| `GET /agents/:name/:id`        | Read materialized history or projected updates.                                          |
| `HEAD /agents/:name/:id`       | Return canonical conversation-stream metadata.                                           |
| `POST /workflows/:name`        | Start an HTTP-exposed workflow run.                                                      |
| `GET /runs/:runId`             | Stream workflow-run events via the Durable Streams protocol.                             |
| `GET /runs/:runId?meta`        | Retrieve the workflow-run record as plain JSON.                                          |
| `HEAD /runs/:runId`            | Return run stream metadata (tail offset, closed status).                                 |
| `* /channels/:name/*`          | Serve method- and suffix-specific discovered channel handlers.                           |

Agent routes and workflow invocation routes are available only when the corresponding module exports `route`. A workflow's existing run resources are available only when its module separately exports `runs`. Discovered channel files export a named `channel` binding whose provider-declared routes are always mounted beneath `/channels/<filename>`. Direct agent prompts and dispatched agent inputs are not runs.

`POST /agents/:name/:id` accepts a [`DeliveredMessage`](/api/agent-api/#deliveredmessage) as its JSON body — the same unified shape `dispatch()` admits. A chat turn is `{ "kind": "user", "body": string, "attachments"?: attachment[] }` with optional `{ type: 'image', data, mimeType, filename? }` attachments, where `data` is base64-encoded image content (capped at 14 MiB of base64 characters per image) for vision-capable models. A structured event is `{ "kind": "signal", "type": string, "body": string, "attributes"?, "tagName"? }`. `POST /workflows/:name` accepts the workflow input as its JSON body.

```bash
# Start a prompt on an HTTP-exposed agent instance.
# :name is the agent module name; :id is any instance id you choose.
curl -X POST http://localhost:3583/agents/assistant/main \
  -H 'Content-Type: application/json' \
  -d '{ "kind": "user", "body": "Summarize the open issues." }'
# → 202 { "streamUrl": "...", "offset": "...", "submissionId": "..." }
```

`POST /agents/:name/:id` is fire-and-forget: it returns `202 { streamUrl, offset, submissionId }` after admission and never blocks on the agent's response. A prompt is delivered into the instance's living conversation and has no single terminal "result" value, so `?wait=result` is not supported on agents and is rejected with `400 invalid_request`; read the reply by observing the conversation from the returned stream coordinates. `POST /workflows/:name` returns `202 { runId }`, or `200 { runId, result }` with `?wait=result` (a workflow run does have a terminal result). Workflow invocation responses do not include `Location` or `Stream-Next-Offset` headers. Any `?wait` value other than `result` is rejected with `400 invalid_request` on the workflow route.

`POST /agents/:name/:id/abort` stops all in-flight and queued durable work for the instance and returns `200 { aborted }` — `aborted` is `true` when there was unsettled work, `false` when the instance was idle. Abort records a durable intent and returns before settlement; the aborted work settles to a distinct **aborted** outcome (a `submission_aborted` conversation entry, and a `submission_settled` record with `outcome: 'aborted'`). Work that already completed is unaffected. The outcome appears in canonical conversation history and on the agent's stream; observe from the returned coordinates to react to it.

`GET /runs/:runId?meta` selects the persisted run-record view (`runId`, `workflowName`, `status`, timestamps, `input`, `result`, `error`) as plain JSON. The `?meta` response carries no Durable Streams headers, and stream parameters (`offset`, `live`) are ignored.

For an existing run, Bapx invokes its owning workflow's `runs` middleware with an ordinary Hono context before handling `GET`, `HEAD`, `?meta`, unsupported methods, or future run methods. Middleware may deny the request or call `next()`. If the workflow has no `runs` export, Bapx returns a generic `404` indistinguishable from an unknown or removed run. Unsupported methods become `405` only after the run is exposed and authorized.

## Compose your own admin endpoints

Bapx ships no admin HTTP surface. Build deployment-inspection endpoints from the server-side primitives exported by `@bapX/runtime` — [`listRuns()`, `getRun()`, and `listAgents()`](/api/data-persistence-api/#inspection-primitives) — behind your own authorization:

```ts title="src/app.ts"
import { listAgents, listRuns } from '@bapX/runtime';
import { bapX } from '@bapX/runtime/routing';
import { Hono } from 'hono';
import { requireOperator } from './auth.ts';

const app = new Hono();
app.route('/', bapX());
app.use('/admin/*', requireOperator);
app.get('/admin/agents', async (c) => c.json(await listAgents()));
app.get('/admin/runs', async (c) => c.json(await listRuns({ limit: 100 })));
export default app;
```

The endpoints, their shapes, and their authorization are application-owned — add filters, pagination params, or projections as your operators need them.
