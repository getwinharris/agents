---
title: Cloudflare
description: Understand the Cloudflare-specific runtime behavior and APIs for Bapx applications.
lastReviewedAt: 2026-07-01
---

The Cloudflare target builds your agents and workflows for the Cloudflare platform. Generated agents and workflows run inside Durable Objects, using the Agents SDK, Workers AI, Cloudflare Sandbox, Cloudflare Shell, and other Worker primitives where appropriate. Durable Objects give each agent instance its own persistent state, durable execution, and global addressability out of the box.

For a deployment walkthrough, see [Deploy Agents on Cloudflare](/ecosystem/deploy/cloudflare/).

## Generated Durable Objects

Bapx generates a Durable Object class and a Wrangler binding for each discovered agent and workflow. Agents are discovered from `src/agents/` and workflows from `src/workflows/` (see [Project Layout](/guide/project-layout/) for supported alternatives):

```txt
src/agents/support-chat.ts   ->  BapxSupportChatAgent
                                 env.FLUE_SUPPORT_CHAT_AGENT

src/workflows/translate.ts   ->  BapxTranslateWorkflow
                                 env.FLUE_TRANSLATE_WORKFLOW
```

The class name is how Cloudflare identifies the Durable Object in migrations. The binding is how your application code accesses the Durable Object namespace at runtime through `env`.

Canonical agent conversation streams, immutable attachments, accepted submissions, and workflow run history are stored in the owning Durable Object's SQLite storage automatically. The Cloudflare target does not use `db.ts`; a source-root `db.ts` is rejected at build time.

Do not hand-author Bapx's generated `FLUE_*` bindings in `wrangler.jsonc`. Declare migrations for generated classes, and declare bindings only for application-owned resources such as your own Durable Objects, R2 buckets, Queues, Hyperdrive configs, Browser Rendering bindings, or Send Email bindings.

## `wrangler.jsonc`

Your project's `wrangler.jsonc` at the project root configures your Worker's name, compatibility settings, and Durable Object migrations. Bapx reads this file during builds and merges its generated bindings alongside your authored configuration.

Bapx generates the Durable Object classes and bindings, but your `wrangler.jsonc` must declare two things:

1. **`nodejs_compat`** in `compatibility_flags`, because Bapx's runtime uses Node.js APIs.
2. **Durable Object migrations** that list every generated class. Cloudflare requires an explicit migration whenever a Worker adds, renames, or removes a Durable Object class.

```jsonc
{
  "$schema": "./node_modules/wrangler/config-schema.json",
  "name": "my-bapX-worker",
  "compatibility_date": "2026-06-01",
  "compatibility_flags": ["nodejs_compat"],
  "migrations": [
    {
      "tag": "v1",
      "new_sqlite_classes": ["BapxRegistry", "BapxSupportChatAgent", "BapxTranslateWorkflow"],
    },
  ],
}
```

`BapxRegistry` is a Bapx-internal Durable Object that indexes workflow runs across the deployment. Always include it in your initial migration.

### Managing migrations

Cloudflare requires an ordered migration history that accounts for every Durable Object class your Worker has ever deployed. When you add a new agent or workflow, append a new migration entry with a unique tag:

```jsonc
{
  "migrations": [
    { "tag": "v1", "new_sqlite_classes": ["BapxRegistry", "BapxSupportChatAgent"] },
    { "tag": "v2", "new_sqlite_classes": ["BapxTranslateWorkflow"] },
  ],
}
```

Never rewrite or reorder deployed migration entries. Generated agent classes require Durable Object SQLite, so introduce them through `new_sqlite_classes`, not legacy `new_classes`. Use Cloudflare's `renamed_classes` and `deleted_classes` migration fields when changing deployed class names or removing classes.

For example, if you remove an agent or workflow that was previously deployed, append a `deleted_classes` migration so Cloudflare knows the class is no longer exported. Without this entry, Wrangler will fail because the migration history references a class that the Worker no longer provides:

```jsonc
{
  "migrations": [
    {
      "tag": "v1",
      "new_sqlite_classes": ["BapxRegistry", "BapxSupportChatAgent", "BapxTranslateWorkflow"],
    },
    { "tag": "v2", "deleted_classes": ["BapxSupportChatAgent"] },
  ],
}
```

Similarly, use `renamed_classes` when a deployed class changes its name, such as when renaming an agent module file:

```jsonc
{
  "migrations": [
    { "tag": "v1", "new_sqlite_classes": ["BapxRegistry", "BapxSupportChatAgent"] },
    {
      "tag": "v2",
      "renamed_classes": [{ "from": "BapxSupportChatAgent", "to": "BapxSupportAssistantAgent" }],
    },
  ],
}
```

## Durable agent execution

Cloudflare agents durably admit direct HTTP prompts together with `dispatch(...)` inputs. All accepted input for one agent instance enters the same queue.

```txt
direct HTTP prompt ─────────────────────┐
                                        ├→ durable per-instance queue → canonical stream
dispatch(...) input ────────────────────┘
```

The submitting connection observes the work but does not own it. If a client disconnects after admission, backend work can continue. Agent events are durably stored and can be replayed from any offset via the Durable Streams protocol.

When a Durable Object resumes after interruption, Bapx decides what to do next from the stored input and canonical conversation progress. It requeues only when it can prove the input was not applied, recognizes already-completed output, and records an interruption instead of blindly repeating uncertain model or tool work.

For the full recovery model, see [Durable Agents](/concepts/durable-execution/).

## Calling a private agent over a service binding

A Bapx Worker deployed without a public route can still be reached from another Worker through a [service binding](https://developers.cloudflare.com/workers/runtime-apis/bindings/service-bindings/). The SDK client sends every request through its `fetch` option, so point that option at the binding instead of the network:

```ts
import { createBapxClient } from '@bapX/sdk';

type Env = { AGENT_APP: Fetcher };

export default {
  async fetch(request: Request, env: Env) {
    const client = createBapxClient({
      // The host is never dialed — only the pathname and query select a route.
      // `baseUrl` must be absolute, so any placeholder origin works.
      baseUrl: 'https://agent.internal',
      fetch: (input, init) => env.AGENT_APP.fetch(new Request(input, init)),
    });

    const admission = await client.agents.send('support', 'ticket-42', {
      message: { kind: 'user', body: 'Summarize this ticket.' },
    });

    return Response.json(admission);
  },
};
```

The binding carries the same HTTP requests the public routes use, so every client operation works over it — `send`, `wait`, `abort`, `history`, and `observe` in both `long-poll` and `sse` modes. Streaming reads travel through the same `fetch`, so live conversation updates cross the binding and the owning Durable Object with no extra wiring.

Attachments are the one exception. `client.agents.attachmentUrl(...)` returns a URL on the placeholder host and the client never fetches it for you; the same URL also appears on `file` parts in `observe()` and `history()` snapshots. To download attachment bytes over a binding, forward that URL through the same fetcher:

```ts
const url = client.agents.attachmentUrl('support', 'ticket-42', attachmentId);
const response = await env.AGENT_APP.fetch(new Request(url));
```

## Workers AI and AI Gateway

[Workers AI](https://developers.cloudflare.com/workers-ai/) lets you run AI models directly on Cloudflare's infrastructure without managing API keys or external provider accounts. Bapx connects to Workers AI automatically on the Cloudflare target, so using a Workers AI model is as simple as specifying the model name:

```ts
export default defineAgent(() => ({
  model: 'cloudflare/@cf/meta/llama-3.1-8b-instruct',
}));
```

No API key is needed. Authorization and billing follow the Worker account, including the [Workers AI free tier](https://developers.cloudflare.com/workers-ai/platform/pricing/).

Bapx also enables [AI Gateway](https://developers.cloudflare.com/ai-gateway/) by default for all `cloudflare/...` models, giving you caching, request logging, rate limiting, and budget controls in the Cloudflare dashboard out of the box.

To customize the gateway, disable it, or target a named gateway, re-register the `cloudflare` provider in `app.ts`. See [Cloudflare Workers AI](/guide/models/#cloudflare-workers-ai-cloudflare-only) for examples.

## Cloudflare Sandbox

[Cloudflare Sandbox](https://developers.cloudflare.com/containers/) provides container-backed Linux environments for agents that need tools such as git, package installation, native binaries, or a real filesystem. Export the sandbox Durable Object class from `cloudflare.ts`, declare its binding and container image in `wrangler.jsonc`, then wrap the RPC stub returned by `getSandbox(...)` with `cloudflareSandbox(...)`:

```ts
import { getSandbox } from '@cloudflare/sandbox';
import { defineAgent } from '@bapX/runtime';
import { cloudflareSandbox } from '@bapX/runtime/cloudflare';

type Env = { Sandbox: DurableObjectNamespace };

export default defineAgent<Env>(({ id, env }) => ({
  model: 'anthropic/claude-sonnet-4-6',
  sandbox: cloudflareSandbox(getSandbox(env.Sandbox, id)),
  cwd: '/workspace',
}));
```

See [Cloudflare Sandbox](/ecosystem/sandboxes/cloudflare/) for container configuration and lifecycle guidance.

## Codemode

By default, Bapx agents use a lightweight in-memory virtual sandbox. This is fast and sufficient for prompt-and-response agents or agents that only need tools and structured results. When an agent needs a durable workspace with structured code execution instead of a full Linux container, use Cloudflare Shell with Codemode.

[Cloudflare Shell](https://developers.cloudflare.com/agents/api-reference/cloudflare-shell/) provides a durable `Workspace` with a model-facing `code` tool backed by [`@cloudflare/codemode`](https://developers.cloudflare.com/agents/api-reference/codemode/). The agent interacts with files through structured code operations rather than shell commands. This means `harness.shell(...)` and `session.shell(...)` do not run arbitrary Linux commands through this sandbox adapter.

Add the sandbox adapter to your project:

```bash
npx bapX add sandbox cloudflare-shell
```

Then import its helpers from your generated sandbox adapter file, not from `@bapX/runtime/cloudflare`:

```ts
import { getDefaultWorkspace, getShellSandbox } from '../sandboxes/cloudflare-shell';
```

Use Cloudflare Shell when a durable Workspace and structured code operations are enough. Use Cloudflare Sandbox when you need a full Linux environment with arbitrary shell access. See [Cloudflare Shell](/ecosystem/sandboxes/cloudflare-shell/) for setup details.

## Extending Agents and Workflows on Cloudflare

Bapx owns each generated Durable Object class. When an agent or workflow needs access to native Cloudflare Agents SDK capabilities such as `onStart()`, `schedule()`, `scheduleEvery()`, or `queue()`, export a `cloudflare` extension descriptor from its module:

```ts
import { defineAgent } from '@bapX/runtime';
import { extend } from '@bapX/runtime/cloudflare';

export default defineAgent(() => ({
  model: 'anthropic/claude-sonnet-4-6',
}));

export const cloudflare = extend({
  base: (Base) =>
    class extends Base {
      async onStart() {
        await this.scheduleEvery(60, 'heartbeat');
      }

      async heartbeat() {
        this.setState({ ...this.state, lastHeartbeatAt: Date.now() });
      }
    },
});
```

`base` receives the Agents SDK `Agent` base class. Bapx applies it before defining the final generated Durable Object subclass, so your authored methods and lifecycle hooks are available on the generated class.

`wrap` receives the final generated class and may return a prototype-preserving constructor wrapper. Use it for integrations like Sentry that instrument the class without replacing its prototype:

```ts
export const cloudflare = extend({
  wrap: (Final) =>
    Sentry.instrumentDurableObjectWithSentry((env) => ({ dsn: env.SENTRY_DSN }), Final),
});
```

Both `base` and `wrap` are optional. Do not override Bapx-owned `fetch()`, `onRequest()`, `onFiberRecovered()`, or `alarm()` methods.

Use this module-local extension point for scheduled or queued behavior that belongs to one generated agent or workflow Durable Object. Do not add a Worker cron trigger just to reach `scheduleEvery(...)`; the Agents SDK scheduling APIs run inside the generated Durable Object after that object is created. If your application needs to create the first instance, expose an authenticated bootstrap route in `app.ts` or otherwise obtain the Durable Object namespace from `env` and address the instance once.

## Extending `cloudflare.ts` Entrypoint

Your project may include a source-root `cloudflare.ts` file for Worker-level Cloudflare code that is separate from individual agent and workflow modules.

Any **named export** from this file becomes a top-level Worker export. This is how you add application-owned Durable Objects to the same Worker that Bapx manages. For example, a cache Durable Object that your agents can access through `env`:

```ts title="src/cloudflare.ts"
import { DurableObject } from 'cloudflare:workers';

// This class becomes a Worker export. Declare its binding and
// migration in wrangler.jsonc so Cloudflare knows about it.
export class SalesforceAuthCache extends DurableObject {
  async refreshIfNeeded() {
    return await this.ctx.storage.get('token');
  }
}
```

After exporting the class, declare its Durable Object binding and migration in `wrangler.jsonc`. Your agents and workflows can then access it through `env.SALESFORCE_AUTH_CACHE`.

The **default export** may contribute non-HTTP Worker handlers. For example, a `scheduled` handler that runs on a cron trigger:

```ts title="src/cloudflare.ts"
export default {
  async scheduled(_controller, env) {
    await env.SALESFORCE_AUTH_CACHE.getByName('default').refreshIfNeeded();
  },
};
```

Use `app.ts` for custom HTTP routes and middleware. `cloudflare.ts` must not define a default `fetch` handler because Bapx keeps HTTP composition in `app.ts`.

Use `cloudflare.ts` for Worker-level events such as inbound email, queues, or cron handlers that are not owned by a specific generated agent or workflow class. To start a Bapx Workflow from one of these handlers, import its discovered default export and call `invoke(workflow, { input })`. Ambient invocation creates a real Workflow Run, does not require an exported HTTP `route`, and bypasses HTTP middleware. Do not call the Workflow's Action or `run(...)` callback directly. See [Schedules](/guide/schedules/) for a Cron Trigger example and [Workflows](/guide/workflows/#application-code) for invocation semantics.

## Reference

### `extend(...)`

```ts
import { extend } from '@bapX/runtime/cloudflare';

function extend<TBase extends object = CloudflareAgentLike, TEnv = any>(
  extension: CloudflareExtension<TBase, TEnv>,
): CloudflareExtension<TBase, TEnv>;
```

Creates a branded Cloudflare extension descriptor for an agent or workflow module. The descriptor may contain `base` and `wrap` callbacks.

Both callbacks are typed against `CloudflareAgentLike`, a structural view of the Agents SDK `Agent` base class covering `state`, `setState()`, `onStart()`, `schedule()`, `scheduleEvery()`, and `queue()`, so typos inside `base` callbacks fail at typecheck. Pass an explicit `TBase` (for example `extend<CloudflareAgentLike<MyState>>({ ... })`) to type against a richer class shape, and an explicit `TEnv` to type the `env` an instrumentation callback receives.

`base(Base)` must return the received class or a subclass. Bapx uses its return value as the superclass for the generated Durable Object.

`wrap(Final)` must return the received class or a prototype-preserving constructor wrapper. Use it for integrations that instrument or proxy the final generated class without replacing its prototype. Subclasses are rejected; only the same class or a `new Proxy(Final, {...})` pattern is allowed. The class both callbacks receive is typed as a real Durable Object constructor, so brand-checked wrappers such as `@sentry/cloudflare`'s `instrumentDurableObjectWithSentry` accept it directly, with no casts or explicit generics.

Both callbacks are optional. When omitted, the corresponding step is an identity operation.

### `getCloudflareContext()`

```ts
import { getCloudflareContext } from '@bapX/runtime/cloudflare';

function getCloudflareContext(): CloudflareContext;
```

Returns the current Cloudflare runtime context. Only valid while code is running inside a Worker or Durable Object request handler.

The returned `CloudflareContext` includes:

- `env` -- the Worker's environment bindings.
- `storage` -- the Durable Object's `{ sql }` SQLite storage handle.

Throws outside of Cloudflare runtime work.

This is intended for advanced application-owned integrations such as custom Cloudflare sandbox adapters. Most applications do not need to call this directly.

### `getDurableObjectIdentity()`

```ts
import { getDurableObjectIdentity } from '@bapX/runtime/cloudflare';

function getDurableObjectIdentity(): BapxDurableObjectIdentity;
```

Returns the generated Durable Object identity for the current agent or workflow context. Only valid inside a generated Durable Object request handler.

The returned `BapxDurableObjectIdentity` includes:

- `bindingName` -- the Wrangler binding name, such as `"FLUE_TRANSLATE_WORKFLOW"`.
- `className` -- the generated class name, such as `"BapxTranslateWorkflow"`.
- `name` -- the instance name passed to `idFromName` or `getAgentByName`.
- `id` -- the Durable Object ID as a string.

Throws when called outside a generated Durable Object context.
