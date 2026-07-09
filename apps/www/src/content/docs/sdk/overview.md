---
title: SDK overview
description: Reference for consuming deployed Bapx agents and workflows with @bapX/sdk.
lastReviewedAt: 2026-06-20
---

The client SDK is exported from `@bapX/sdk`. Use it from applications that consume deployed Bapx agents and workflows.

```ts
import { createBapxClient } from '@bapX/sdk';

const client = createBapxClient({
  baseUrl: 'https://example.com/api',
  token: process.env.FLUE_TOKEN,
});
```

## Client

[`createBapxClient(...)`](/docs/sdk/client/) configures access to a deployed Bapx application.

## API namespaces

- [`client.agents`](/docs/sdk/agents/) invokes persistent agent instances and streams their events.
- [`client.workflows`](/docs/sdk/workflows/) starts workflow runs.
- [`client.runs`](/docs/sdk/runs/) inspects and streams runs exposed by their owning workflows.

Deployment-wide listing (all runs, all agents) is a server-side concern: compose your own endpoints from the `listRuns()`, `getRun()`, and `listAgents()` primitives exported by `@bapX/runtime`. See [compose your own admin endpoints](/docs/api/routing-api/#compose-your-own-admin-endpoints).

## Shared types

- [Events and records](/docs/sdk/events/) describes observable events, records, and normalized model-turn data.
- [Errors](/docs/sdk/errors/) describes HTTP and stream errors.
