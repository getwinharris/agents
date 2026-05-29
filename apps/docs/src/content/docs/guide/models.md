---
title: Models & Providers
description: Select models, configure providers, and tune reasoning behavior in Flue agents.
---

A Flue agent does not receive an implicit LLM choice. Configure the model that should handle ordinary operations, then override it only where a particular operation needs different cost, speed, or capability characteristics.

This guide shows how to:

- choose model identifiers;
- set model and reasoning defaults in created agents or reusable profiles;
- override those defaults for an individual operation;
- supply credentials and configure or register providers; and
- use binding-backed Cloudflare Workers AI models on the Cloudflare target.

For configuring addressable agents, see [Agents](/docs/guide/building-agents/). For initializing agents during finite orchestration, see [Workflows](/docs/guide/workflows/). For operation results and options beyond model selection, see [Prompting](/docs/guide/prompting/).

## Choose a model identifier

Model strings use this format:

```text
provider/model-id
```

The portion before the first slash selects the provider prefix. Everything after it identifies the model for that provider and may itself contain slashes. For example:

| Model string | Provider prefix | Model id |
| --- | --- | --- |
| `anthropic/claude-sonnet-4-6` | `anthropic` | `claude-sonnet-4-6` |
| `openai/gpt-5.5` | `openai` | `gpt-5.5` |
| `openrouter/moonshotai/kimi-k2.6` | `openrouter` | `moonshotai/kimi-k2.6` |
| `cloudflare/@cf/moonshotai/kimi-k2.6` | `cloudflare` | `@cf/moonshotai/kimi-k2.6` |

Built-in provider prefixes resolve models from the runtime model catalog. If you use a catalog provider with an unknown model id, initialization or the overriding operation fails rather than silently selecting another model. A prefix that your application registers with `registerProvider(...)` resolves through that registration instead; see [Register a provider](#register-a-provider).

A **created agent** must establish its model intent before Flue can initialize its environment. Its `createAgent(...)` initializer must return one of:

- a `model: 'provider/model-id'` default;
- `model: false`, explicitly declaring that there is no default model; or
- a `profile` whose `model` property is a model string or `false`.

```ts title=".flue/workflows/summarize.ts"
import { createAgent, type FlueContext } from '@flue/runtime';

const writer = createAgent(() => ({
  model: 'anthropic/claude-sonnet-4-6',
}));

export async function run({ init }: FlueContext) {
  const harness = await init(writer);
  const session = await harness.session();
  return session.prompt('Summarize the release notes.');
}
```

The model choice is part of agent behavior: it influences available capabilities, latency, pricing, context limits, and whether a requested reasoning mode or input type is supported. Choose a default that is suitable for the agent's normal work rather than relying on each caller to remember one.

## Set an agent default

Put the ordinary model and reasoning settings on the created agent when that behavior is specific to one agent:

```ts
import { createAgent } from '@flue/runtime';

const supportAgent = createAgent(() => ({
  model: 'anthropic/claude-sonnet-4-6',
  thinkingLevel: 'medium',
  instructions: 'Give accurate, concise customer-support answers.',
}));
```

The initializer may use its context to choose configuration at initialization time. For example, an application can select a configured default according to deployment, tenant policy, or payload metadata while still returning an explicit `model` value.

### Reuse defaults with a profile

Use `defineAgentProfile(...)` when model behavior belongs to a reusable agent profile, such as a role used by more than one created agent or as a declared subagent:

```ts
import { createAgent, defineAgentProfile } from '@flue/runtime';

const carefulWriter = defineAgentProfile({
  model: 'anthropic/claude-sonnet-4-6',
  thinkingLevel: 'high',
  instructions: 'Check claims carefully before writing.',
});

const releaseNotesAgent = createAgent(() => ({
  profile: carefulWriter,
}));
```

A profile supplied to `createAgent(...)` can carry the required model intent. If the initializer also returns scalar configuration such as `model` or `thinkingLevel`, that created-agent field replaces the corresponding profile value. This is useful for adapting a profile while retaining its other behavior:

```ts
const economicalReleaseNotesAgent = createAgent(() => ({
  profile: carefulWriter,
  model: 'anthropic/claude-haiku-4-5',
  thinkingLevel: 'low',
}));
```

### Deliberately omit a default with `model: false`

Set `model: false` only when the application is intended to choose a model for every model-using operation:

```ts
import { createAgent, type FlueContext } from '@flue/runtime';

const router = createAgent(() => ({
  model: false,
}));

export async function run({ init }: FlueContext) {
  const harness = await init(router);
  const session = await harness.session();

  return session.prompt('Extract the key entities.', {
    model: 'openai/gpt-5.5',
  });
}
```

`model: false` satisfies the initialization requirement, but it does **not** select a fallback model. A later `prompt()` or `skill()` that needs a model fails unless it supplies a model override. For `task()`, a selected named subagent can instead provide its own model; an anonymous task still needs an available parent default or call-level override. In particular, an addressable agent that receives direct HTTP or WebSocket prompts should normally have a configured default, because those direct inputs do not let the client pass Flue's in-process `prompt(..., { model })` option.

## Override the model for one operation

Pass `model` to `session.prompt(...)` when one operation needs a specialized model. For example, keep an economical default for routine work and request a more capable model for a difficult synthesis step:

```ts
const analyst = createAgent(() => ({
  model: 'anthropic/claude-haiku-4-5',
}));

export async function run({ init }: FlueContext) {
  const harness = await init(analyst);
  const session = await harness.session();

  const classification = await session.prompt('Classify the ticket priority.');
  const recommendation = await session.prompt('Prepare a risk-aware resolution plan.', {
    model: 'anthropic/claude-sonnet-4-6',
  });

  return { classification, recommendation };
}
```

For `prompt()` and `skill()`, model precedence is:

```text
operation model override > configured agent or profile default
```

For `task()`, selecting a named subagent introduces one additional default:

```text
operation model override > selected subagent profile model > parent agent or profile default
```

The override lasts only for that operation. It does not change the session's configured default for the next call.

The same `model` option is available on `session.skill(...)` and `session.task(...)`:

```ts
await session.skill('review', {
  model: 'anthropic/claude-sonnet-4-6',
});

await session.task('Perform a detailed security assessment.', {
  model: 'anthropic/claude-sonnet-4-6',
});
```

For details about prompt calls, structured output, usage metadata, images, and cancellation, continue to [Prompting](/docs/guide/prompting/).

## Configure reasoning effort

Use `thinkingLevel` to express how much reasoning effort Flue should request for model-facing work. The supported values are:

| Value | Intent |
| --- | --- |
| `'off'` | Do not request additional reasoning. |
| `'minimal'` | Request the smallest reasoning effort. |
| `'low'` | Favor lower reasoning cost or latency. |
| `'medium'` | Balanced effort; the current framework default. |
| `'high'` | Favor more careful reasoning. |
| `'xhigh'` | Request the highest exposed effort tier. |

Configure the normal level on the agent or its profile, then override it on an individual operation where appropriate:

```ts
import { createAgent, type FlueContext } from '@flue/runtime';

const reviewer = createAgent(() => ({
  model: 'anthropic/claude-sonnet-4-6',
  thinkingLevel: 'low',
}));

export async function run({ init }: FlueContext) {
  const harness = await init(reviewer);
  const session = await harness.session();

  const draft = await session.prompt('Draft a short response.');
  const audit = await session.prompt('Find correctness risks in this proposed response.', {
    thinkingLevel: 'high',
  });

  return { draft, audit };
}
```

Reasoning-level precedence is:

```text
operation thinkingLevel > configured agent or profile default > framework default ('medium')
```

`session.skill(...)` and `session.task(...)` accept the same per-operation `thinkingLevel` option. A named task profile can also supply its own normal reasoning level for work delegated to that profile.

A `thinkingLevel` value is a request, not a promise of identical behavior across models. Whether a level produces reasoning controls, reasoning output, or any observable difference depends on the resolved model and provider protocol. Confirm that the model you select supports the behavior needed by your application, especially when switching providers with an operation-level `model` override.

## Supply provider credentials

For ordinary catalog-backed HTTP providers, put credentials in the environment available to the running Flue application. Common examples in Flue projects are:

| Provider prefix | Typical environment variable |
| --- | --- |
| `anthropic` | `ANTHROPIC_API_KEY` |
| `openai` | `OPENAI_API_KEY` |
| `openrouter` | `OPENROUTER_API_KEY` |

Do not put credential values in agent modules, profiles, prompts, or committed configuration files.

For Node.js local development and one-shot workflow runs, supply environment files through the Node commands documented in [Configuration](/docs/guide/configuration/) and [Deploy on Node.js](/docs/ecosystem/deploy/node/). For example, a Node-target application can use `flue dev --target node --env .env` after storing its provider variable in an ignored `.env` file.

For local Cloudflare development, use Wrangler/Vite local variable conventions: place local variables in `.dev.vars` or `.env` beside your Wrangler configuration, and run:

```bash
pnpm exec flue dev --target cloudflare
```

Do not pass `--env` to Cloudflare development: the Cloudflare target uses the official Vite integration's variable loading rather than Flue's Node env-file option. See [Deploy on Cloudflare](/docs/ecosystem/deploy/cloudflare/) for Worker configuration and deployment setup.

Binding-backed Workers AI is different from these HTTP-provider credential flows: a `cloudflare/...` model uses the Worker's `AI` binding and does not use a model-provider API key. See [Use Workers AI on Cloudflare](#use-workers-ai-on-cloudflare).

## Configure a built-in provider

Place provider runtime setup in the application's `app.ts`, not in each agent or operation module. Import `configureProvider(...)` from `@flue/runtime/app` to adjust transport settings for an already-resolvable provider while retaining catalog model metadata such as capability and token-limit information.

For example, route Anthropic models through an application-configured gateway endpoint and key:

```ts title=".flue/app.ts"
import { configureProvider, flue } from '@flue/runtime/app';
import { Hono } from 'hono';

if (process.env.ANTHROPIC_GATEWAY_URL) {
  configureProvider('anthropic', {
    baseUrl: process.env.ANTHROPIC_GATEWAY_URL,
    apiKey: process.env.ANTHROPIC_API_KEY,
  });
}

const app = new Hono();
app.route('/', flue());

export default app;
```

`configureProvider(provider, settings)` supports these transport settings:

| Setting | Purpose |
| --- | --- |
| `baseUrl` | Send calls for the resolved provider to a different endpoint, such as an AI gateway or proxy. |
| `headers` | Merge additional default headers into outgoing calls. |
| `apiKey` | Supply the API key used for that provider at runtime. |
| `storeResponses` | For OpenAI Responses API or Azure OpenAI Responses API models only, send `store: true` when you intentionally want hosted response-item persistence. |

Provider configuration is keyed by the provider slug of the resolved model. For built-in catalog models this is normally the familiar prefix, such as `anthropic`. A registered provider can set a different provider slug; configure that resolved slug if you need to patch its transport settings.

For authentication, an explicitly configured `apiKey` overrides a key on a provider registration. When neither is configured, the underlying provider integration performs its normal environment-variable lookup. This lets ordinary catalog providers use their usual environment credentials while gateways and private endpoints can be configured centrally.

## Register a provider

Use `registerProvider(...)` in `app.ts` when you need a new model prefix, such as a locally hosted or proxy-hosted OpenAI-compatible endpoint. The selected prefix then works in any `model: 'prefix/model-id'` configuration.

This example registers a local OpenAI-compatible Ollama endpoint, following the application's existing provider pattern:

```ts title=".flue/app.ts"
import { flue, registerProvider } from '@flue/runtime/app';
import { Hono } from 'hono';

registerProvider('ollama', {
  api: 'openai-completions',
  baseUrl: 'http://localhost:11434/v1',
  contextWindow: 8192,
  maxTokens: 2048,
});

const app = new Hono();
app.route('/', flue());

export default app;
```

An agent can now select a model id provided by that endpoint:

```ts
import { createAgent } from '@flue/runtime';

const localAgent = createAgent(() => ({
  model: 'ollama/llama3.1:8b',
}));
```

For an authenticated OpenAI-compatible proxy, include `apiKey` and optionally headers in the registration, reading values from runtime environment configuration rather than embedding them in source:

```ts
registerProvider('private-gateway', {
  api: 'openai-completions',
  baseUrl: process.env.LLM_GATEWAY_URL!,
  apiKey: process.env.LLM_GATEWAY_API_KEY,
  contextWindow: 128000,
  maxTokens: 8192,
});
```

Registered HTTP providers supply endpoint and protocol information, but they do not automatically provide catalog metadata for arbitrary model ids. If your application relies on accurate context-window-aware compaction behavior, set `contextWindow` and `maxTokens`, or supply per-model values:

```ts
registerProvider('private-gateway', {
  api: 'openai-completions',
  baseUrl: process.env.LLM_GATEWAY_URL!,
  apiKey: process.env.LLM_GATEWAY_API_KEY,
  models: {
    'small-chat': { contextWindow: 32000, maxTokens: 4096 },
    'long-context': { contextWindow: 200000, maxTokens: 8192 },
  },
});
```

A registration takes precedence over catalog resolution for the same prefix:

```text
registered provider prefix > built-in catalog provider prefix
```

Registrations are last-write-wins. Avoid registering a prefix such as `anthropic`, `openai`, or `cloudflare` unless you deliberately intend to replace how every `prefix/...` model resolves in your application. Use `configureProvider(...)` instead when the goal is only to change endpoint, authentication, or headers for an existing provider while preserving its catalog models.

If a service uses a wire protocol not already supported by the runtime, advanced integrations can first register an API protocol implementation with `registerApiProvider(...)` and then expose a model prefix with `registerProvider(...)`. Most OpenAI-compatible gateways need only `registerProvider(..., { api: 'openai-completions', ... })`.

## Use Workers AI on Cloudflare

On the Cloudflare target, Flue provides a binding-backed provider for Workers AI. Select it with the `cloudflare` prefix and a Workers AI model id such as `@cf/moonshotai/kimi-k2.6`:

```ts title=".flue/agents/assistant.ts"
import { createAgent } from '@flue/runtime';

export default createAgent(() => ({
  model: 'cloudflare/@cf/moonshotai/kimi-k2.6',
}));
```

### Add the required binding

Binding-backed models require an `AI` binding in the user-owned Wrangler configuration at the project root:

```jsonc title="wrangler.jsonc"
{
  "$schema": "https://workers.cloudflare.com/schema/wrangler.json",
  "ai": {
    "binding": "AI"
  }
}
```

Build or develop this application with the Cloudflare target. The generated Cloudflare runtime registers the `cloudflare` prefix using `env.AI`, so calls are dispatched through the Worker binding rather than over a provider HTTP endpoint:

```bash
pnpm exec flue dev --target cloudflare
pnpm exec flue build --target cloudflare
```

A `cloudflare/...` binding call does not need an API key in your application environment. Authorization is provided by the binding attached to the deployed or locally emulated Worker.

### Customize AI Gateway behavior

By default, the generated Cloudflare integration routes `cloudflare/...` binding calls through Cloudflare AI Gateway with gateway id `default`. To select a named gateway, configure cache/log metadata options, or opt out of passing a gateway, register the `cloudflare` prefix yourself in `app.ts`. User application registration is preserved instead of the generated default registration.

```ts title=".flue/app.ts"
import { env } from 'cloudflare:workers';
import { flue, registerProvider } from '@flue/runtime/app';
import { Hono } from 'hono';

registerProvider('cloudflare', {
  api: 'cloudflare-ai-binding',
  binding: env.AI,
  gateway: {
    id: 'production-agent-traffic',
    cacheTtl: 300,
    metadata: { application: 'support' },
    collectLog: true,
  },
});

const app = new Hono();
app.route('/', flue());

export default app;
```

To send binding calls without a gateway option, use `gateway: false` in that registration. Gateway options supported by Flue include `id`, `skipCache`, `cacheTtl`, `cacheKey`, `metadata`, `collectLog`, `eventId`, and `requestTimeoutMs`.

### Reasoning limitation for binding-backed Workers AI

Flue accepts `thinkingLevel` on agents and operations using `cloudflare/...` because it is part of the general agent API. However, the current binding-backed Workers AI implementation does **not** send `thinkingLevel` or reasoning-effort controls in its `env.AI.run(...)` payload. A Workers AI model may emit reasoning content of its own accord, but do not rely on `thinkingLevel` to control reasoning effort on this provider path.

### Do not confuse binding and URL-backed Cloudflare providers

`cloudflare/...` specifically means Flue's binding-backed Workers AI integration and requires the Cloudflare target plus `env.AI` binding. It is distinct from URL-backed catalog providers such as `cloudflare-workers-ai/...` or `cloudflare-ai-gateway/...`, which make HTTP provider calls and require their applicable Cloudflare API credentials in environment configuration.

Use the binding-backed form when your Worker should call Workers AI through its platform binding. Use a URL-backed Cloudflare catalog provider only when your application intentionally needs that HTTP credential-and-endpoint flow.

Continue to [Build & Deploy](/docs/guide/deployment/) for target and durability decisions, [Deploy on Cloudflare](/docs/ecosystem/deploy/cloudflare/) for platform configuration, [Configuration](/docs/guide/configuration/) for application setup boundaries, [Agents](/docs/guide/building-agents/) for continuing session behavior, and [Workflows](/docs/guide/workflows/) for initializing model-driven work inside finite operations.
