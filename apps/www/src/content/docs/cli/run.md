---
title: bapX run
description: Reference for executing one agent prompt or workflow invocation from the command line.
lastReviewedAt: 2026-06-22
---

## Synopsis

```bash
bapX run <name> [--target <node|cloudflare>] [--id <id>] [--input <json>] [--server <path|url>] [--header 'Name: value'] [--root <path>] [--output <path>] [--config <path>] [--env <path>]
```

## Description

`bapX run` executes one discovered agent prompt or workflow invocation, streams its activity, prints the terminal result, and exits. With no absolute `--server`, it starts a temporary Node.js or Cloudflare HTTP runtime and calls the resource through the normal application.

The authored `app.ts`, outer middleware, and authored resource middleware run as they do for an HTTP caller. The temporary runtime also makes route-free discovered resources available through an existing authored `bapX()` mount, without changing authored metadata or deployment output. It does not create a mount or bypass application composition.

## Resource names

`<name>` may identify an agent or workflow. If both kinds use the same name, qualify it:

```bash
bapX run agent:report --input '{"message":"Prepare the report."}'
bapX run workflow:report --input '{"period":"week"}'
```

An absolute `--server` always requires `agent:<name>` or `workflow:<name>` because no local project is available for discovery.

## Input and identity

Agent `--input` is required and takes a `message` string, delivered as a `kind: 'user'` message:

```json
{ "message": "Summarize the open issues." }
```

It may also include an `images` field of `{ type: "image", data, mimeType }` attachments. `--id` selects the persistent agent-instance ID. If omitted, Bapx generates and displays a bare ULID. Reusing an ID resumes persisted state only when the configured persistence adapter survives the temporary process.

Workflow `--input` is parsed as JSON and passed unchanged. It may be omitted when the workflow accepts omitted input. Workflow `--id` is not supported; workflows use their generated run IDs.

## Server and headers

`--server` selects the Bapx base URL:

```bash
bapX run summarize --server /api/bapX --input '{"text":"hello"}'
bapX run workflow:summarize --server https://example.com/api/bapX --input '{"text":"hello"}'
```

A path starts a temporary local runtime and points the SDK at that authored `bapX()` mount. An absolute URL attaches to an existing local or deployed application and skips local configuration, discovery, build, and startup. `--server` never creates, moves, or alters routes; a wrong path receives the application's normal response.

Repeat `--header` to send authentication or application context on admission, stream reads, and reconnects:

```bash
bapX run report --header 'Authorization: Bearer ...'
```

For repeated header names, the final value wins case-insensitively.

## Project options

| Option            | Default                                                    | Description                                                                                                                         |
| ----------------- | ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `--target <name>` | Configuration value                                        | Select `node` or `cloudflare` for a temporary local runtime.                                                                        |
| `--root <path>`   | Selected config-file directory, or config search directory | Select the project root.                                                                                                            |
| `--output <path>` | `<root>/dist`                                              | Configure deployment build output. Temporary Node execution does not write runtime artifacts there.                                 |
| `--config <path>` | Auto-discovered `bapX.config.*`                            | Select a configuration file.                                                                                                        |
| `--env <path>`    | `<config-base>/.env`, when present                         | Select one alternate `.env`-format file loaded before configuration. Relative paths resolve from `<config-base>`. Shell values win. |

These project options are not resolved for an absolute `--server` attachment.

## Output and target support

Run identity and streamed events are written to stderr. A successful non-null terminal result is written as formatted JSON to stdout. The temporary runtime stops after settlement and does not watch or reload source files.

Local execution supports both Node.js and Cloudflare. Cloudflare uses the normal local Vite/workerd runtime and its persisted development state.

## Examples

```bash
bapX run assistant --input '{"message":"Draft a release summary."}'
bapX run summarize --target cloudflare --input '{"text":"hello"}' --env .env.staging
```
