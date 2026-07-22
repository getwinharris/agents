---
title: CLI
description: Use the Bapx CLI to configure, develop, exercise, inspect, and build an application.
lastReviewedAt: 2026-06-22
---

Install `@bapX/cli` as a development dependency, then invoke `bapX` through your package manager:

```bash
npm install --save-dev @bapX/cli
npx bapX dev
```

The CLI requires Node.js `>=22.19.0`. Cloudflare development and deployment also require `wrangler` as a development dependency.

## Develop locally

`bapX dev` serves the application for its configured Node.js or Cloudflare target, watches source files, and rebuilds on changes:

```bash
npx bapX dev
```

Use its real HTTP and SDK surface while authoring application routes and integrations. Agents and workflows are not public merely because they are discovered; [Routing](/docs/guide/routing/) explains authored exposure.

## Exercise one resource

`bapX run` executes one agent prompt or workflow invocation and exits:

```bash
npx bapX run assistant --input '{"message":"Summarize this repository."}'
npx bapX run summarize-ticket --input '{"ticket":"Ticket details"}'
```

Without an absolute `--server`, the command starts the configured Node.js or Cloudflare runtime temporarily. It calls through the authored `app.ts` and an existing `bapX()` mount, so normal application and resource middleware executes. Route-free resources are temporarily available through that mount for local use; this does not alter deployment behavior or create a mount.

Use `--server /api/bapX` for a non-root authored local mount. An absolute URL attaches to an already-running local or deployed application:

```bash
npx bapX run workflow:summarize-ticket \
  --server https://example.com/api/bapX \
  --input '{"ticket":"Ticket details"}'
```

See [`bapX run`](/docs/cli/run/) for input, identity, headers, resource qualification, and server behavior.

## Build and deploy

`bapX build` creates target-specific deployment output:

```bash
npx bapX build
```

A build packages the discovered application for its runtime target. It does not choose a model, add credentials, expose additional routes, or configure platform-owned bindings. Continue to the [Node.js](/docs/ecosystem/deploy/node/) or [Cloudflare](/docs/ecosystem/deploy/cloudflare/) deployment guide.

## Command reference

| Command                              | Description                                                                     |
| ------------------------------------ | ------------------------------------------------------------------------------- |
| [`bapX init`](/docs/cli/init/)       | Create an initial `bapX.config.ts`.                                             |
| [`bapX dev`](/docs/cli/dev/)         | Serve and watch the local application.                                          |
| [`bapX run`](/docs/cli/run/)         | Execute one agent prompt or workflow invocation, then exit.                     |
| [`bapX build`](/docs/cli/build/)     | Create deployable application artifacts.                                        |
| [`bapX add`](/docs/cli/add/)         | Fetch sandbox, channel, or database installation blueprints for a coding agent. |
| [`bapX update`](/docs/cli/update/)   | Fetch a current blueprint so a coding agent can apply its newer upgrade guides. |
| [`bapX docs`](/docs/cli/docs/)       | List, read, and search the bundled Bapx documentation.                          |
