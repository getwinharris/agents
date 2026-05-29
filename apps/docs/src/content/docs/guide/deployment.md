---
title: Build & Deploy
description: Build a Flue application, choose a deployment target, and configure production durability deliberately.
---

Deploying a Flue application begins before you choose a hosting service. You first choose which runtime should own agent instances, workflow runs, asynchronous input, session history, and any sandbox workspace your application depends on.

This guide walks through that decision and the build-to-deployment workflow. Use it after your agents and workflows run locally, before continuing to a target-specific deployment guide.

## Prepare a deployable application

A deployable Flue application must discover at least one agent or workflow module. Your project may also provide `app.ts` to compose authentication, health checks, provider setup, webhook ingress, and mounted Flue routes.

```text title="Example application layout"
my-application/
├─ flue.config.ts
├─ .flue/
│  ├─ app.ts
│  ├─ agents/
│  │  └─ assistant.ts
│  └─ workflows/
│     └─ generate-report.ts
└─ package.json
```

If `<root>/.flue/` exists, Flue discovers authored application modules there and does not combine them with root-level `agents/`, `workflows/`, or `app.ts`. If you have not selected a source layout yet, start with [Project Layout](/docs/guide/project-layout/).

Before deploying, make sure the application boundary matches the behavior you want to publish:

| You want to expose… | Author… | Lifecycle |
| --- | --- | --- |
| A continuing conversational or event-driven agent instance | An agent module, optionally exposed by `route` or `websocket` middleware | Persistent instance and sessions; no workflow run created by direct or dispatched input |
| One bounded job with inspectable history | A workflow module, optionally exposed by `route` or `websocket` middleware | A finite workflow run with a `runId` |
| Verified webhook or application event delivery | A route in `app.ts` that calls `dispatch(...)` | Asynchronous agent-session input identified by `dispatchId`; not a workflow run |

Read [Routing](/docs/guide/routing/) before publishing public transports or application ingress routes.

## Choose a deployment target

Flue currently builds for two runtime targets: `node` and `cloudflare`. Both run authored agents and workflows, but they do not have the same default durability or platform capabilities.

| Concern | Node.js target | Cloudflare target |
| --- | --- | --- |
| Build output | A runnable Node server, normally `dist/server.mjs` | A Workers application built through the official Cloudflare Vite integration |
| Typical deployment | VM, container, managed Node web service, or CI workflow execution | Cloudflare Workers with generated Durable Object wiring |
| Local development | `flue dev --target node`; accepts explicit `--env` files | `flue dev --target cloudflare`; uses Wrangler/Vite `.dev.vars` or `.env` conventions |
| One-shot workflow execution | `flue run --target node` | Exercise routes through `flue dev`; `flue run` does not support this target |
| Direct agent session default | Process-memory state unless you configure `persist` | Durable Object SQLite-backed session state through the generated durable runtime path |
| Workflow run-history default | Process memory | Durable Object-backed run storage and registry |
| `dispatch(...)` admission default | Process-memory queue | Durable Object-backed processing path |
| Host filesystem access | Available only when you deliberately configure a host-backed sandbox such as `local()` | Not implicit; choose a Cloudflare-compatible workspace or container integration |

Choose **Node.js** when the application should run as an ordinary server or container, or when CI should execute one workflow against a checked-out repository. Choose **Cloudflare** when your application needs Workers bindings or the generated Durable Object-backed runtime path for agent instances, workflow runs, and asynchronous processing.

## Configure the build target

Set the normal target in `flue.config.ts` so builds and local development agree about the artifact you intend to deploy:

```ts title="flue.config.ts"
import { defineConfig } from '@flue/cli/config';

export default defineConfig({
  target: 'node',
});
```

A configuration file can also set stable source and output locations:

```ts title="flue.config.ts"
import { defineConfig } from '@flue/cli/config';

export default defineConfig({
  target: 'cloudflare',
  root: './apps/assistant',
  output: './artifacts/assistant',
});
```

`flue.config.ts` configures build selection only: `target`, `root`, and `output`. Put models and provider registration in authored runtime modules, authentication and mounted routes in `app.ts`, and Cloudflare bindings in Wrangler configuration. See [Configuration](/docs/guide/configuration/) for path resolution and CLI overrides.

## Build the deployment artifact

Run a production build for your selected target:

```bash title="Build Node.js output"
pnpm exec flue build --target node
```

```bash title="Build Cloudflare output"
pnpm exec flue build --target cloudflare
```

### Node.js output

A Node.js build writes a runnable server entrypoint at `<output>/server.mjs`, normally `dist/server.mjs`:

```bash
node dist/server.mjs
```

The generated server listens on `PORT`, defaulting to `3000`. Deploy its runtime dependencies together with the build output: authored application imports can remain external dependencies rather than being bundled into `server.mjs`.

### Cloudflare output

A Cloudflare build reads the project-root Wrangler configuration, prepares generated build input under `.flue-vite/` and `.flue-vite.wrangler.jsonc`, and uses the official Cloudflare Vite integration to emit deployable output.

Treat your `wrangler.jsonc`, `wrangler.json`, or `wrangler.toml` as the editable platform configuration. Do not edit `.flue-vite*` files as long-lived configuration; they are generated build input.

## Define the deployed HTTP surface

Discovery and public exposure are separate. An agent or workflow module is not reachable through public HTTP or WebSockets merely because it is built.

| Module export | Public capability when its middleware continues |
| --- | --- |
| Agent `route` | `POST /agents/:name/:id` |
| Agent `websocket` | WebSocket upgrade at `GET /agents/:name/:id` |
| Workflow `route` | `POST /workflows/:name` |
| Workflow `websocket` | WebSocket upgrade at `GET /workflows/:name` |

Without an authored `app.ts`, the generated application mounts the Flue surface at `/`. With `app.ts`, your default export owns the request pipeline and must mount `flue()` explicitly:

```ts title=".flue/app.ts"
import { flue } from '@flue/runtime/app';
import { Hono } from 'hono';

const app = new Hono();

app.get('/health', (c) => c.json({ ok: true }));
app.route('/api', flue());

export default app;
```

A custom mount changes route URLs, such as `/api/workflows/generate-report`. Flue does not automatically add your deployment platform's health route. If your host checks `/health`, author and test it in `app.ts` as shown above.

If you need deployment-wide administrative inspection, mount `admin()` separately behind operator authorization; it is not automatically part of `flue()`.

## Supply secrets and platform configuration

Keep runtime credentials out of source files and build configuration.

### Node.js

During local Node development, load ignored environment files explicitly:

```bash
pnpm exec flue dev --target node --env .env.local
```

For deployment, provide environment values when your host starts `node dist/server.mjs`. Building the Node artifact does not package production credential values into it.

### Cloudflare

For local Cloudflare development, place values in `.dev.vars` or `.env` beside Wrangler configuration and run:

```bash
pnpm exec flue dev --target cloudflare
```

Do not pass `--env` to Cloudflare development. Deployed secrets and bindings are Cloudflare platform configuration managed through Wrangler or your deployment system. Selecting `target: 'cloudflare'` does not by itself configure a Workers AI binding or select a model.

## Plan persistence before production

Flue applications can retain several kinds of state. They are controlled independently.

| State you need to retain | Node.js default | Cloudflare generated-runtime default | What to configure when the default is insufficient |
| --- | --- | --- | --- |
| Agent session conversation history and compaction checkpoints | In memory for one server process | Durable Object SQLite-backed session storage along the generated durable path | Return a custom `SessionStore` as `persist` for your created agent when needed |
| Sandbox files, packages, and generated artifacts | Depends on sandbox; the default lightweight sandbox is in memory | Depends on sandbox; durable session storage does not make default sandbox files durable | Select a durable workspace or sandbox connector |
| Workflow run records and events | In memory for one process | Durable Object-backed run storage and registry | Choose deployment target and retention policy appropriate to run inspection |
| Dispatched input before/while it is processed | Process-memory admission | Durable Object-backed processing correlated by `dispatchId` | Design external side effects for idempotency and retries |

A durable conversation does not imply durable files. A durable filesystem does not imply durable conversation history. Likewise, workflow run records do not represent direct prompts or dispatch deliveries: only workflow invocations have `runId` values and appear in run history.

For continuing agent session state, see [Agents](/docs/guide/building-agents/). For the persistence contract, see [Data Persistence API](/docs/api/data-persistence-api/). For filesystem and compute boundaries, see [Sandboxes](/docs/guide/sandboxes/).

## Verify before deployment

Before handing the artifact to a deployment platform:

1. **Build the intended target.** Confirm Flue discovers the agents and workflows you intend to deploy.
2. **Confirm its output.** For Node.js, confirm `dist/server.mjs` or your configured equivalent exists. For Cloudflare, confirm the Workers production build succeeds.
3. **Run through the intended local target.** Use `flue dev --target node` or `flue dev --target cloudflare`; use `flue run --target node` only for Node workflow execution.
4. **Call only routes you enabled and mounted.** A workflow or direct agent endpoint exists only when its module exports its transport middleware and your app mounts `flue()` at the expected path.
5. **Check lifecycle expectations.** Use `?wait=result` when an HTTP workflow test expects the completed result; direct agent prompts will not return `runId`; `dispatch(...)` returns an admission receipt rather than an assistant result.
6. **Test durability separately.** If session continuity must survive a Node restart, test the configured `SessionStore`. If files must survive, test the selected sandbox lifecycle independently.
7. **Make external effects retry-safe.** Webhook delivery, asynchronous dispatch processing, and durable platform recovery can repeat work; protect posts, mutations, and notifications with application-owned idempotency.

## Continue to a deployment environment

| Deployment destination | Continue to… |
| --- | --- |
| Conventional Node server, container, VM, or host | [Node.js](/docs/ecosystem/deploy/node/) |
| Cloudflare Workers and Durable Objects | [Cloudflare](/docs/ecosystem/deploy/cloudflare/) |
| Managed Node web service on Render | [Render](/docs/ecosystem/deploy/render/) |
| One-shot Node workflow execution in GitHub Actions | [GitHub Actions](/docs/ecosystem/deploy/github-actions/) |
| One-shot Node workflow execution in GitLab CI/CD | [GitLab CI/CD](/docs/ecosystem/deploy/gitlab-ci/) |

Use [Observability](/docs/guide/observability/) after deployment to choose workflow-run inspection, agent-operation tracing, token/cost telemetry, and sensitive-event handling.
