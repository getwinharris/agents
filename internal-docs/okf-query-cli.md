---
type: "Internal Doc"
title: "OKF query CLI implementation"
description: "bapX okf is the repository-owned command surface for making OKF Markdown knowledge queryable without replacing the authored corpus."
---
# OKF query CLI implementation

`bapX okf` is the repository-owned command surface for making OKF Markdown knowledge queryable without replacing the authored corpus.

## Source ownership

- Public command contract: `apps/www/src/content/docs/cli/okf.md`
- CLI implementation: `packages/cli/bin/bapX.ts`
- CLI tests: `packages/cli/test/okf.test.mjs`
- Product tracking: GitHub issue #45

Canonical knowledge remains in Markdown, YAML frontmatter, `index.yaml`, and generated `map.mmd` files. The JSON emitted by `bapX okf index` is derived evidence, not an authoritative source.

## Current command surface

```bash
bapX okf index --root <path> [--output <path>]
bapX okf query --root <path> <query>
```

The command indexes `.md` files under the explicit root and skips `.git`, `.turbo`, `node_modules`, `dist`, `build`, and `test-results`.

If `--output` is used, the output file must remain inside the same root. This keeps hosted CLI execution compatible with user-specific and project-specific sandboxes.

## OKF metadata handling

The initial parser intentionally supports the small OKF field set needed for retrieval:

- v0.1: `type`, `title`, `description`, `tags`, `timestamp`
- v0.2 additive trust/provenance fields: `generated.at`, `verified.at`, `sources`, `status`, `stale_after`

`timestamp` is treated as `generatedAt` when `generated.at` is absent.

## Remaining engineering work

- Add exact metadata filters before MiniSearch fallback.
- Include `index.yaml` summaries and `map.mmd` edges in a versioned relation index.
- Support incremental updates using content hashes and changed paths.
- Bind hosted execution to a per-account/business/project sandbox registry.
- Promote the same query layer into Admin before exposing it to Agents.
