---
title: bapX dev console
description: Reference for attaching a terminal console to a running bapX agent or workflow.
lastReviewedAt: 2026-07-26
---

`@bapX/dev-console` is a terminal client for an already-running bapX application. It is separate from `@bapX/cli`: it does not discover projects, start a development server, load `.env` files, or expose additional routes.

Start the application separately, then provide the absolute URL where its `bapX()` routes are mounted.

## Usage

```bash
npx bapX dev
npx bapX-dev-console agent:support --server http://127.0.0.1:3583
```

Resources must be qualified as `agent:<name>` or `workflow:<name>` when attaching to an external server:

```bash
npx bapX-dev-console agent:support \
  --server http://127.0.0.1:3583/api/bapX \
  --id support-demo

npx bapX-dev-console workflow:deploy \
  --server http://127.0.0.1:3583/api/bapX \
  --input '{"environment":"staging"}'
```

## Options

| Option | Description |
| --- | --- |
| `--server <url>` | Absolute URL of the mounted bapX application. |
| `--id <id>` | Agent instance ID; generated when omitted. |
| `--input <json>` | Initial agent input or workflow input. |
| `--token <token>` | Bearer token sent with every request. |
| `--header 'Name: value'` | Repeatable request header. |
| `--help` | Show usage. |
| `--version` | Show package version. |

For agents, `--input` is a JSON object with a string `message`. The console stays open for follow-up prompts on the same agent instance. A workflow runs once and leaves a read-only transcript.

This is a developer console, not the hosted browser-session CLI. A `bapX browser` command is not implemented in the current `packages/cli` command surface.
