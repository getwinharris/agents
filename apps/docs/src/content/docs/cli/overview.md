---
title: CLI
description: Use the Flue CLI to configure, develop, exercise, inspect, and build an application.
lastReviewedAt: 2026-06-13
---

Install `@flue/cli` as a development dependency, then invoke the `flue` executable through your package manager:

```bash
npm install --save-dev @flue/cli
npx flue dev
```

The CLI requires Node.js `>=22.18.0`. Cloudflare development and deployment also require `wrangler` as a development dependency.

The CLI follows the application lifecycle: initialize a target, develop against it locally, exercise agents and workflows, inspect workflow runs, and create the artifact you deploy. Each command page documents its complete arguments, options, output, and target-specific behavior.

## Initialize and configure

Use `flue init` once to create a starter `flue.config.ts` for Node.js or Cloudflare:

```bash
npx flue init --target node
```

The configuration selects the normal runtime target and can set the project root and build output. CLI flags provide one-time overrides. See [`flue init`](/docs/cli/init/), [Configuration](/docs/reference/configuration/), and [Project Layout](/docs/guide/project-layout/) for the available settings and source discovery conventions.

## Develop locally

Use `flue dev` while authoring an application:

```bash
npx flue dev
```

Development mode builds the discovered application for its configured target, serves it locally, and rebuilds as source files change. Use it to exercise the same routes and runtime environment that callers use. Agents and workflows are not public merely because they are built; [Routing](/docs/guide/routing/) explains how to expose them and add application-owned routes.

Keep local credentials and platform values in environment configuration rather than source. See [`flue dev`](/docs/cli/dev/) for watch behavior, ports, environment files, and target-specific details.

## Exercise agents and workflows

For a Node.js target, the CLI can exercise discovered agents and workflows without public HTTP routes.

Use `flue connect` for an interactive connection to one continuing agent instance:

```bash
npx flue connect support-assistant ticket-8472
```

Use `flue run` for one finite workflow invocation:

```bash
npx flue run summarize-ticket --payload '{"ticket":"Ticket details"}'
```

These commands use private local execution and do not pass through application ingress middleware. Deployed applications instead receive input through their published routes and transports. See [`flue connect`](/docs/cli/connect/) and [`flue run`](/docs/cli/run/) for their exact contracts.

## Inspect workflow runs

Use `flue logs` to replay or follow events for a workflow run owned by a running Flue server:

```bash
npx flue logs run_01JX...
```

Runs are workflow-only. Direct agent prompts and dispatched agent inputs are persistent session interactions, not runs. A one-shot `flue run` process streams its own events and cannot be inspected later with `flue logs`. See [`flue logs`](/docs/cli/logs/) for server selection, authentication headers, filtering, and output formats.

## Build and deploy

Use `flue build` to create target-specific deployment output:

```bash
npx flue build
```

A build packages the discovered application for its runtime target. It does not choose a model, add credentials, expose additional routes, or configure platform-owned bindings. See [`flue build`](/docs/cli/build/) for output details, then continue to the [Node.js](/docs/ecosystem/deploy/node/) or [Cloudflare](/docs/ecosystem/deploy/cloudflare/) deployment guide.

## Command reference

| Command                              | Description                                                                     |
| ------------------------------------ | ------------------------------------------------------------------------------- |
| [`flue init`](/docs/cli/init/)       | Create an initial `flue.config.ts`.                                             |
| [`flue dev`](/docs/cli/dev/)         | Start a watch-mode local development server.                                    |
| [`flue connect`](/docs/cli/connect/) | Open an interactive local agent-instance connection.                            |
| [`flue run`](/docs/cli/run/)         | Execute one workflow invocation locally.                                        |
| [`flue logs`](/docs/cli/logs/)       | Replay or follow workflow-run events from a running server.                     |
| [`flue build`](/docs/cli/build/)     | Create deployable application artifacts.                                        |
| [`flue add`](/docs/cli/add/)         | Fetch sandbox, channel, or database installation blueprints for a coding agent. |
| [`flue update`](/docs/cli/update/)   | Fetch a current blueprint so a coding agent can apply its newer upgrade guides. |
| [`flue docs`](/docs/cli/docs/)       | List, read, and search the bundled Flue documentation.                          |
