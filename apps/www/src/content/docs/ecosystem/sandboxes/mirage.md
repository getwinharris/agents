---
title: Mirage
description: Connect Bapx agents to Mirage workspaces and mounted resources.
lastReviewedAt: 2026-05-30
---

The Mirage adapter adapts an application-owned Mirage `Workspace` into Bapx's sandbox interface. Mirage offers runtime packages for Node and browser-class runtimes, allowing the adapter pattern to be used on Node or Cloudflare when you choose compatible resources.

## Quickstart

Add mounted workspace sandbox capability to an existing Bapx project with the [Mirage](https://docs.mirage.strukto.ai) blueprint. Run the following command in your terminal or coding agent of choice:

```bash
bapX add sandbox mirage
```

## Overview

The Mirage blueprint installs `@struktoai/mirage-node` for Node or `@struktoai/mirage-browser` for Cloudflare when needed, then creates `sandboxes/mirage.ts` in your source-root. The generated adapter accepts an application-created `Workspace`; resource mounts, credentials, writable boundaries, and lifetime remain application-owned.

```ts title="<source-root>/sandboxes/mirage.ts (abridged)"
// bapX-blueprint: sandbox/mirage@1
import { createSandboxSessionEnv } from '@bapX/runtime';
import type { SandboxApi, SandboxFactory, SessionEnv, FileStat } from '@bapX/runtime';
import type { Workspace as MirageWorkspace } from '@struktoai/mirage-core';

export interface MirageAdapterOptions {
  cwd?: string;
}

/* ... generated shellQuote() helper ... */

class MirageSandboxApi implements SandboxApi {
  constructor(
    private workspace: MirageWorkspace,
    private bapXContextId: string,
  ) {}

  /* ... generated workspace.fs operations; rm rejects recursive and force before mutation ... */

  async stat(path: string): Promise<FileStat> {
    const s = await this.workspace.fs.stat(path);
    return {
      isFile: s.type === 'file',
      isDirectory: s.type === 'directory',
      ...(s.size === null ? {} : { size: s.size }),
      ...(s.modified === null ? {} : { mtime: new Date(s.modified) }),
    };
  }

  async exec(
    command: string,
    options?: {
      cwd?: string;
      env?: Record<string, string>;
      timeoutMs?: number;
      signal?: AbortSignal;
    },
  ): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    return this.runShell(command, options);
  }

  private async runShell(
    command: string,
    options?: {
      cwd?: string;
      env?: Record<string, string>;
      timeoutMs?: number;
      signal?: AbortSignal;
    },
  ): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    const timeoutSignal =
      typeof options?.timeoutMs === 'number' ? AbortSignal.timeout(options.timeoutMs) : undefined;
    const callerSignal = options?.signal;
    const signal =
      callerSignal && timeoutSignal
        ? AbortSignal.any([callerSignal, timeoutSignal])
        : (callerSignal ?? timeoutSignal);

    try {
      const result = await this.workspace.execute(command, {
        sessionId: this.bapXContextId,
        cwd: options?.cwd,
        env: options?.env,
        signal,
      });
      return {
        stdout: result.stdoutText,
        stderr: result.stderrText,
        exitCode: result.exitCode,
      };
    } catch (err) {
      if (callerSignal?.aborted) throw err;
      const isTimeout =
        timeoutSignal?.aborted &&
        (err === timeoutSignal.reason ||
          (err instanceof Error && (err.name === 'AbortError' || err.name === 'TimeoutError')));
      if (isTimeout) {
        return {
          stdout: '',
          stderr: `[bapX:mirage] Command timed out after ${options?.timeoutMs} milliseconds.`,
          exitCode: 124,
        };
      }
      throw err;
    }
  }
}

export function mirage(workspace: MirageWorkspace, options?: MirageAdapterOptions): SandboxFactory {
  return {
    async createSessionEnv({ id }: { id: string }): Promise<SessionEnv> {
      try {
        workspace.createSession(id);
      } catch {
        workspace.getSession(id);
      }

      const sandboxCwd = options?.cwd ?? '/';
      const api = new MirageSandboxApi(workspace, id);
      return createSandboxSessionEnv(api, sandboxCwd);
    },
  };
}
```

Pass `mirage(workspace)` as an agent's `sandbox` to expose mounted resources through a Mirage session keyed by the Bapx context id. File stats preserve Mirage's unknown size or modification time by omitting those fields; `timeoutMs` creates a millisecond timeout signal, caller cancellation takes precedence, and only timeout cancellation becomes an exit-code-124 result. Mirage's direct filesystem API does not implement recursive or force removal, so the adapter rejects either option before mutation.

## Configure

| Requirement                              | Purpose                                                                                   |
| ---------------------------------------- | ----------------------------------------------------------------------------------------- |
| `@struktoai/mirage-node` package         | **Required on Node.js** — Provides Node-compatible Mirage Workspace resources.            |
| `@struktoai/mirage-browser` package      | **Required on Cloudflare** — Provides browser-compatible Workspace resources only.        |
| Application-owned resource configuration | **Required** — Defines mounts, credentials, writable boundaries, and lifetime.            |
| Environment-variable credentials         | **Not required** — Mirage resource credentials are configured by the application instead. |

The generated adapter uses Mirage's shared workspace contract. Some Mirage resources, such as SSH- or database-oriented Node resources, require the Node runtime and must not be imported into a Cloudflare build.

## Choose this adapter when

Use Mirage when your application wants to assemble a workspace from explicit mounted resources and present that workspace to an agent through a single sandbox boundary. Your application owns resource mounting, credentials, writable boundaries, and workspace lifetime.

See [Sandboxes](/guide/sandboxes/), [Deploy on Node.js](/ecosystem/deploy/node/), [Deploy on Cloudflare](/ecosystem/deploy/cloudflare/), and [Sandbox Adapter API](/api/sandbox-api/).
