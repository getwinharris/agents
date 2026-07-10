---
title: bapX add
description: Reference for discovering and applying Bapx implementation blueprints.
lastReviewedAt: 2026-06-14
---

## Synopsis

```bash
bapX add
bapX add <kind> <name-or-url> [--print]
```

## Description

`bapX add` fetches a Markdown implementation blueprint for a coding agent. It does not install packages or write project files itself.

With no arguments, the command lists known blueprints. With a kind and known name, it fetches that blueprint. With a kind and absolute URL, it fetches the generic blueprint for that kind and uses the URL as the coding agent's research starting point. Paths are not accepted.

## Arguments

| Argument        | Description                                                                          |
| --------------- | ------------------------------------------------------------------------------------ |
| `<kind>`        | Blueprint kind: `sandbox`, `channel`, `database`, or `tooling`.                      |
| `<name-or-url>` | Known blueprint slug or alias, or an absolute URL used as a research starting point. |

## Options

| Option    | Description                                                                  |
| --------- | ---------------------------------------------------------------------------- |
| `--print` | Write raw blueprint Markdown to stdout regardless of coding-agent detection. |

## Blueprint kinds

| Kind       | Description                                                    |
| ---------- | -------------------------------------------------------------- |
| `sandbox`  | Build a sandbox adapter from provider documentation or source. |
| `channel`  | Add verified provider ingress, a client, and app-owned tools.  |
| `database` | Add a database-backed persistence adapter.                     |
| `tooling`  | Add developer tooling such as observability or evaluation.     |

Run `bapX add` without arguments to list the currently known blueprints.

## Examples

```bash
bapX add
bapX add sandbox daytona --print
bapX add sandbox daytona --print | claude
bapX add channel github --print | codex
bapX add channel stripe --print | codex
bapX add channel notion --print | codex
bapX add channel resend --print | codex
bapX add channel shopify --print | codex
bapX add channel intercom --print | codex
bapX add channel zendesk --print | codex
bapX add channel salesforce-marketing-cloud --print | codex
bapX add channel slack --print | codex
bapX add channel discord --print | codex
bapX add channel teams --print | codex
bapX add channel google-chat --print | codex
bapX add channel linear --print | codex
bapX add channel telegram --print | codex
bapX add channel whatsapp --print | codex
bapX add channel twilio --print | codex
bapX add channel messenger --print | codex
bapX add sandbox @cloudflare/shell --print | opencode
bapX add database postgres --print | codex
bapX add tooling braintrust --print | opencode
bapX add tooling sentry --print | opencode
bapX add tooling vitest-evals --print | opencode
bapX add sandbox https://e2b.dev --print | claude
bapX add channel https://provider.example/webhooks --print | codex
bapX add database https://database.example/docs --print | codex
bapX add tooling https://tool.example/docs --print | opencode
```

See [Sandboxes](/guide/sandboxes/), [Channels](/guide/channels/), and the [Ecosystem](/ecosystem/) for implementation guidance.
