---
title: bapXsandbox E2B
description: Use the managed bapXsandbox E2B isolation path for user and project agent workspaces.
lastReviewedAt: 2026-07-26
---

bapXsandbox E2B is the default remote sandbox path for bapX when an agent needs an isolated Linux workspace for commands, files, browser work, or project deployment preparation. The project adapter adapts an initialized E2B sandbox from the `e2b` package into Bapx's sandbox interface.

The current public blueprint is adapter-level: it wires an existing E2B sandbox into a Bapx agent. Hosted bapX presents that provider integration as bapXsandbox E2B and owns account, business, project, CLI, and browser-profile isolation above the adapter.

## Quickstart

Add Linux sandbox capability to an existing Bapx project with the [E2B](https://e2b.dev) blueprint. Run the following command in your terminal or coding agent of choice:

```bash
bapX add sandbox e2b
```

## Overview

The blueprint installs `e2b` when needed and creates `sandboxes/e2b.ts` in your source-root. That file adapts an E2B sandbox that your application has already created; it does not create, retain, or close provider resources.

```ts title="<source-root>/sandboxes/e2b.ts (abridged)"
// bapX-blueprint: sandbox/e2b@1
import { createSandboxSessionEnv } from '@bapX/runtime';
import type { SandboxApi, SandboxFactory, SessionEnv, FileStat } from '@bapX/runtime';
import type { Sandbox as E2BSandbox } from 'e2b';

class E2BSandboxApi implements SandboxApi {
  constructor(private sandbox: E2BSandbox) {}

  /* Implements file reads, writes, stat, listing, existence, and mkdir with sandbox.files. */

  /* Rejects recursive or force before calling sandbox.files.remove(). */

  /* Implements exec() with sandbox.commands.run(), forwarding timeoutMs unchanged. */
}

export function e2b(sandbox: E2BSandbox): SandboxFactory {
  return {
    async createSessionEnv(): Promise<SessionEnv> {
      const sandboxCwd = '/home/user';
      const api = new E2BSandboxApi(sandbox);
      return createSandboxSessionEnv(api, sandboxCwd);
    },
  };
}
```

Pass an initialized E2B `Sandbox` to `e2b(...)`, then assign the returned factory to an agent's `sandbox` property. Bapx resolves workspace paths from `/home/user`, exposes E2B's files and commands through session operations, forwards command timeouts in milliseconds, and reports only the file metadata E2B exposes. E2B's direct remove API has no recursive or force controls, so the adapter rejects either option before deletion. In customer projects, the bapX runtime remains responsible for sandbox lifecycle, user scoping, and workspace boundaries.

## Hosted bapX isolation

Hosted bapX scopes remote sandbox work by the signed-in account, selected business, and selected project. The VPS hosts the product and project Node.js entrypoints; agent execution, CLI usage, browser work, and project file operations run inside the authorized E2B sandbox boundary. Customer project work is represented publicly as:

```txt
root-sandbox/<username>/<business-slug>/projects/<project-slug>/
```

Within that project boundary, bapX allocates browser profile storage under a server-derived profile id:

```txt
.agents/browser/profiles/<server-derived-profile-id>/
```

That profile is shared by the authorized user and that user's project agents so browser sessions can continue inside the same project context. Other users and other project scopes receive different profile ids and cannot resolve paths into another user's workspace. Browser profile data is not telemetry and must not be copied into logs, traces, or public artifacts.

The bapX CLI installed for the project is scoped to the same sandbox user, business, and project boundary. It must not reuse another user's CLI config, browser profile, cached tokens, downloads, or workspace path.

## Configure

| Variable      | Purpose                                        |
| ------------- | ---------------------------------------------- |
| `E2B_API_KEY` | **Required** — Authenticates with the E2B API. |

| Requirement                    | Purpose                                                                     |
| ------------------------------ | --------------------------------------------------------------------------- |
| `e2b` package                  | **Required** — Provides the initialized E2B sandbox adapted by Bapx.        |
| E2B sandbox                  | **Required** — Supplies the command and filesystem environment.             |
| Application-owned lifecycle    | **Required** — Creates the sandbox and closes or retains it as appropriate. |

## Integration shape

```ts
import { Sandbox } from 'e2b';
import { defineAgent } from '@bapX/runtime';
import { e2b } from '../sandboxes/e2b';

const sandbox = await Sandbox.create();
const agent = defineAgent(() => ({
  model: 'anthropic/claude-sonnet-4-6',
  sandbox: e2b(sandbox),
}));
```

Select templates, timeouts, network access, secret exposure, and resource reuse through the bapX runtime and provider policy. Bapx adapts the active environment; it does not expose another sandbox product beside bapXsandbox E2B.

See [Sandboxes](/docs/guide/sandboxes/) and [Sandbox Adapter API](/docs/api/sandbox-api/).
