---
title: bapX dev
description: Reference for starting a watch-mode local Bapx development server.
lastReviewedAt: 2026-06-22
---

## Synopsis

```bash
bapX dev [--target <node|cloudflare>] [--root <path>] [--output <path>] [--config <path>] [--port <number>] [--env <path>]
```

## Description

`bapX dev` starts a local server, watches project files, and reloads after relevant changes. Editing, creating, or deleting an auto-discovered `bapX.config.*` file restarts the local development session with freshly resolved configuration. Explicit `--config <path>` files are watched even when they live outside the project root. A configuration restart interrupts active local requests and streaming connections. When an edited configuration is invalid, the command waits for the next configuration change and starts a new session after the error is corrected.

## Options

| Option                        | Default                                                    | Description                                                                                                                         |
| ----------------------------- | ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `--target <node\|cloudflare>` | Configuration value                                        | Select the development target. Required unless supplied by configuration.                                                           |
| `--root <path>`               | Selected config-file directory, or config search directory | Select the project root.                                                                                                            |
| `--output <path>`             | `<root>/dist`                                              | Configure deployment build output. Node development does not write runtime artifacts there.                                        |
| `--config <path>`             | Auto-discovered `bapX.config.*`                            | Select a configuration file.                                                                                                        |
| `--port <number>`             | `3583`                                                     | Select the local server port.                                                                                                       |
| `--env <path>`                | `<config-base>/.env`, when present                         | Select one alternate `.env`-format file loaded before configuration. Relative paths resolve from `<config-base>`. Shell values win. |

## Target-specific behavior

### Node.js

Runs the project through an in-memory Vite module runtime without writing deployment artifacts. On a source change, Bapx pauses new agent, workflow, dispatch, and channel admissions, lets accepted work settle, then replaces the loaded application on the same port. Observation-only requests and accepted event streams do not block this drain.

While a reload is draining or loading, new admissions receive a structured `503` response. If changed source does not load, the listener remains available in a failed state and recovers after the next valid edit. Work started outside Bapx's tracked operations, including detached promises created by application handlers, is not part of reload quiescence.

### Cloudflare

Starts Vite with the official Workers integration. Cloudflare runtime bindings continue to use the official `.dev.vars`, `.env`, and `CLOUDFLARE_ENV` conventions.

## Examples

```bash
bapX dev
bapX dev --target node
bapX dev --target cloudflare --port 8787
bapX dev --env .env.staging
```

See the [CLI overview](/docs/cli/overview/) for the complete development workflow.
