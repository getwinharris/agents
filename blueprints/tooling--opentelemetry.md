---
{ "kind": "tooling", "version": 1, "website": "https://opentelemetry.io" }
---

# Add OpenTelemetry to Bapx

You are an AI coding agent adding vendor-neutral OpenTelemetry tracing and
metrics to a Bapx project. `@bapX/opentelemetry` projects Bapx's live runtime
observations into standard OpenTelemetry GenAI spans and metrics.

It **does not** configure an SDK, exporter, sampler, credentials, or
deployment-specific flushing. The project owns those. This blueprint wires the
projection; it does not choose a backend.

## Inspect the project

Read local instructions, detect the package manager, and select the first
existing source root: `<root>/.agents/`, then `<root>/src/`, then `<root>/`.
Inspect `bapX.config.ts`, `app.ts`, existing modules under `agents/` and
`workflows/`, and any observability wiring already present.

If the project already registers an instrumentation instance, extend it rather
than registering a second one. Only one instance should be registered per
process.

Determine the configured target before choosing an SDK:

- **Node:** use the Node SDK and a matching exporter.
- **Cloudflare:** the Node SDK does not run in a Worker. Use an exporter that
  targets the Workers runtime, or export over OTLP/HTTP.

If the target cannot be determined, ask the user.

## Install

Install the adapter and the OpenTelemetry API with the project's package
manager, alongside an SDK and exporter compatible with the target:

```sh
npm install @bapX/opentelemetry @opentelemetry/api
```

`@bapX/opentelemetry` declares `@bapX/runtime` and `@opentelemetry/api` as peer
dependencies. Do not install a second copy of either.

## Register the instrumentation

Configure the SDK **first**, then register exactly one instrumentation instance.
Registering before the SDK means early spans have no provider and are dropped.

```ts
// bapX-blueprint: tooling/opentelemetry@1
import { createOpenTelemetryInstrumentation } from '@bapX/opentelemetry';
import { instrument } from '@bapX/runtime';

const instrumentation = createOpenTelemetryInstrumentation();
const disposeInstrumentation = instrument(instrumentation);
```

Call `disposeInstrumentation()` on shutdown, and flush the SDK before the
process exits. A process that exits without flushing loses its last spans,
which is exactly the window where failures are most interesting.

## Content policy — decide this deliberately

`createOpenTelemetryInstrumentation` accepts a `content` option. Prompts, model
responses, and tool arguments are **customer data**. Exporting them sends that
data to whatever backend the SDK points at.

- `content: false` — record no content. Start here.
- A `GenAIContentPolicy` — opt in to specific scopes only.

Do not enable content capture to make debugging easier without confirming the
backend is an approved destination for that data. In a bapX deployment,
customer prompts leaving the workspace boundary is a product decision, not a
telemetry detail.

## Revision pinning

The package implements the Development GenAI conventions pinned to a specific
upstream commit, with its own projection and extension revisions. **Changing any
revision requires an explicit compatibility review** — a silent bump changes the
shape of every emitted span and can break dashboards and alerts downstream.

Pin the adapter version the project has validated rather than tracking latest.

## Verify

1. Confirm exactly one instrumentation instance is registered per process.
2. Confirm the SDK is configured before `instrument()` runs.
3. Run one agent turn and confirm spans reach the configured backend with GenAI
   semantics, not just that the process starts.
4. Confirm the content policy matches the intended setting, and that no prompt
   or response text appears in exported spans when content is disabled.
5. Confirm shutdown disposes the instrumentation and flushes the SDK.

## Notes

Use this for vendor-neutral traces. `tooling--sentry` covers error reporting and
`tooling--braintrust` covers agent-trace evaluation; they are complementary, and
a project may register more than one.

## Upgrade Guide

### Version 1 — 2026-08-20

Initial version.
