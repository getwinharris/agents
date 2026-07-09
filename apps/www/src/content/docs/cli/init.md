---
title: bapX init
description: Reference for creating an initial Bapx project configuration file.
lastReviewedAt: 2026-05-30
---

## Synopsis

```bash
bapX init --target <node|cloudflare> [--root <path>] [--force]
```

## Description

`bapX init` writes a starter `bapX.config.ts`. It does not create agents, workflows, or an application entrypoint.

## Options

| Option                        | Default                   | Description                                                        |
| ----------------------------- | ------------------------- | ------------------------------------------------------------------ |
| `--target <node\|cloudflare>` | Required                  | Select the target written to `bapX.config.ts`.                     |
| `--root <path>`               | Current working directory | Select the existing directory in which to write `bapX.config.ts`.  |
| `--force`                     | `false`                   | Write `bapX.config.ts` when a `bapX.config.*` file already exists. |

Without `--force`, any existing `bapX.config.*` file prevents generation. If `--force` writes `bapX.config.ts` beside another supported variant, the new `.ts` file takes precedence and the existing file remains on disk.

## Output

The generated `target` value matches `--target`. For `bapX init --target node`, the file is:

```ts title="bapX.config.ts"
import { defineConfig } from '@bapX/cli/config';

export default defineConfig({
  target: 'node',
});
```

## Examples

```bash
bapX init --target node
bapX init --target cloudflare --root ./apps/assistant
```

See [Configuration](/docs/reference/configuration/) for the complete `bapX.config.ts` surface.
