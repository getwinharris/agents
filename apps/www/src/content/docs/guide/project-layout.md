---
title: Project Layout
description: Understand the source files and generated output in a Bapx project.
lastReviewedAt: 2026-06-22
---

Bapx discovers application entrypoints from your project's source directory. Use `src/` for new projects, with `app.ts`, `db.ts`, `cloudflare.ts`, `agents/`, `workflows/`, and `channels/` defining the application surfaces Bapx builds.

## Example project layout

```text
my-project/
├─ package.json
├─ bapX.config.ts
├─ src/
│  ├─ app.ts
│  ├─ db.ts
│  ├─ cloudflare.ts
│  ├─ agents/
│  │  └─ support-assistant.ts
│  ├─ workflows/
│  │  └─ summarize-ticket.ts
│  └─ channels/
│     └─ github.ts
└─ dist/
```

Organize supporting application code however you prefer inside `src/`. The files and directories below are the parts of your application that Bapx discovers and builds automatically.

## Important files and directories

| Path            | Purpose                                                                               | Learn more                                                            |
| --------------- | ------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `app.ts`        | Optional entrypoint for composing Bapx with your application's routes and middleware. | [Routing](/guide/routing/)                                       |
| `db.ts`         | Optional Node.js persistence adapter for agent conversations and workflow runs.       | [Database](/guide/database/)                                     |
| `cloudflare.ts` | Optional Cloudflare-only module for Worker exports and non-HTTP handlers.             | [Cloudflare](/ecosystem/deploy/cloudflare/#extending-the-worker) |
| `agents/`       | Addressable agents that can receive continuing interactions over time.                | [Agents](/guide/building-agents/)                                |
| `workflows/`    | Finite operations that receive input and return a result.                             | [Workflows](/guide/workflows/)                                   |
| `channels/`     | Verified provider HTTP ingress discovered by filename.                                | [Channels](/guide/channels/)                                     |

### `app.ts`

`app.ts` is an optional custom application entrypoint. Add it when your server needs to compose Bapx routes with application behavior such as authentication, webhooks, health endpoints, or a route prefix. A project without `app.ts` uses Bapx's generated application directly.

For more information, see [Routing](/guide/routing/).

### `db.ts`

`db.ts` is an optional Node.js persistence entrypoint. Its default export configures the `PersistenceAdapter` used for canonical agent conversations, attachments, accepted submissions, and workflow-run records. Without it, Node.js uses in-memory SQLite and loses this state when the process exits. Cloudflare provides Durable Object SQLite automatically and rejects `db.ts`.

For more information, see [Database](/guide/database/).

### `cloudflare.ts`

`cloudflare.ts` is an optional Cloudflare-only deployment module. Its named exports become top-level Worker exports, and its optional default export adds non-HTTP Worker handlers. Use it for same-Worker Durable Object classes, explicit Cloudflare Sandbox aliases, queue consumers, scheduled handlers, and other Cloudflare-native additions. Custom HTTP handling remains in `app.ts`.

For more information, see [Deploy on Cloudflare](/ecosystem/deploy/cloudflare/#extending-the-worker).

### `agents/`

The `agents/` directory contains agents that Bapx can address by name. Each immediate file defines one discovered agent, and its filename becomes the agent name: `src/agents/support-assistant.ts` is discovered as `support-assistant`.

Keep agent files flat inside `agents/`; nested files are not discovered as additional agents. Prefer lower-kebab-case filenames such as `support-assistant.ts` so names remain portable across deployment targets.

For more information, see [Agents](/guide/building-agents/).

### `workflows/`

The `workflows/` directory contains finite operations that Bapx can invoke by name. Each immediate file defines one discovered workflow, and its filename becomes the workflow name: `src/workflows/summarize-ticket.ts` is discovered as `summarize-ticket`.

Keep workflow files flat inside `workflows/`; nested files are not discovered as additional workflows. Prefer lower-kebab-case filenames such as `summarize-ticket.ts` so names remain portable across deployment targets.

For more information, see [Workflows](/guide/workflows/).

### `channels/`

The `channels/` directory contains provider HTTP integrations. Each immediate
file must export one named `channel` binding. Its filename becomes an immutable
namespace: `src/channels/github.ts` publishes provider-declared routes beneath
`/channels/github`.

Nested files are ordinary support modules and are not discovered as channels.
Every route has a provider-owned non-empty suffix such as `/webhook`, `/events`,
or `/interactions`; `/channels/github` itself is not an endpoint.

For more information, see [Channels](/guide/channels/).

## Source directory

`src/` is the canonical source directory for new Bapx projects. When integrating Bapx into another application or maintaining an existing layout, authored modules may instead live in `.bapX/` or at the project root. Bapx selects one source directory in this order:

1. `.bapX/` — A self-contained Bapx source area inside a larger application.
2. `src/` **(Recommended)** — The recommended layout for new projects.
3. The project root — A compact layout for small dedicated projects.

The first matching directory wins. Bapx does not merge layouts: when `.bapX/` exists, it does not discover agents, workflows, channels, `app.ts`, `db.ts`, or `cloudflare.ts` from `src/` or the project root. Authored modules may still import ordinary supporting code from elsewhere in the project.

The source directory is always discovered relative to your project root. To configure the project root, see [Configuration](/reference/configuration/).

## Output directory

`dist/` is the default output directory for generated build artifacts. It is created at the project root when you build the application and is never part of authored source discovery.

To change where generated artifacts are written, set `output` in `bapX.config.ts`:

```ts title="bapX.config.ts"
import { defineConfig } from '@bapX/cli/config';

export default defineConfig({
  output: './build',
});
```

For more information about project and output configuration, see [Configuration](/reference/configuration/).
