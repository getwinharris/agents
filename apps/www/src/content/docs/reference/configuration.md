---
title: Configuration
description: Reference for bapX.config.ts options.
---

Use `bapX.config.ts` to select the build target, project root, and build output directory. Import `defineConfig()` from `@bapX/cli/config` for type checking and editor completion:

```ts title="bapX.config.ts"
import { defineConfig } from '@bapX/cli/config';

export default defineConfig({
  target: 'node',
});
```

Only the options listed below are accepted. Bapx recognizes `bapX.config.ts`, `.mts`, `.mjs`, `.js`, `.cjs`, and `.cts`, in that priority order. TypeScript configuration files are loaded directly by Node and must use erasable syntax.

For source-module placement, see [Project Layout](/docs/guide/project-layout/). For configuration-file discovery, command-line overrides, and environment files, see the [CLI reference](/docs/cli/overview/).

## `target`

- **Type:** `'node' | 'cloudflare'`
- **Default:** none

Build and development target. This option is required unless `--target` is passed to the CLI.

- `'node'` builds a Node.js server.
- `'cloudflare'` builds a Workers-compatible application.

## `root`

- **Type:** `string`
- **Default:** directory containing the selected `bapX.config.*` file, or the selected search directory when no configuration file is loaded

Project root. Must not be empty. Relative values loaded from a configuration file resolve from the directory containing that file.

Bapx uses the first matching source location:

1. `<root>/.agents` when it exists as a directory
2. `<root>/src` when it exists as a directory
3. `<root>`

## `output`

- **Type:** `string`
- **Default:** `<root>/dist`

Build output directory. Must not be empty. Relative values loaded from a configuration file resolve from the directory containing that file, not from `root`.

## Vite configuration

Export `vite` from `bapX.config.ts` to pass native Vite configuration to the development server. Use Vite's `defineConfig()` helper for type checking.

```ts title="bapX.config.ts"
import { defineConfig as defineViteConfig } from 'vite';
import { defineConfig } from '@bapX/cli/config';

export default defineConfig({
  target: 'node',
});

export const vite = defineViteConfig({
  server: {
    watch: {
      ignored: ['**/evals/results/**'],
    },
  },
});
```

Bapx owns the Vite project root, server mode, host, port, and its internal Vite integrations. Other Vite options are merged into the Node and Cloudflare development servers.

## `defineConfig()`

```ts
function defineConfig(config: UserBapxConfig): UserBapxConfig;
```

Provides type checking and editor completion for `bapX.config.ts`. Returns the configuration unchanged.
