---
title: bapX okf
description: Reference for indexing and querying OKF Markdown knowledge inside one authorized workspace root.
lastReviewedAt: 2026-07-26
---

## Synopsis

```bash
bapX okf index --root <path> [--output <path>]
bapX okf query --root <path> <query>
```

## Description

`bapX okf` turns an OKF workspace or project bundle into a local, deterministic search surface. It reads Markdown concepts with YAML frontmatter below one explicit root and returns canonical source paths as evidence.

The command does not replace the source files. Markdown, `index.yaml`, links, and `map.mmd` remain the authored knowledge contract.

## Root isolation

Always pass the workspace, business, or project root being queried:

```bash
bapX okf query --root users/alex/acme/projects/storefront "billing connector"
```

The command reads only Markdown files under that root and skips generated or dependency folders such as `.git`, `node_modules`, `dist`, and `build`.

When `index` writes a file with `--output`, the output path must stay inside the same root:

```bash
bapX okf index --root users/alex/acme --output users/alex/acme/.bapx-okf-index.json
```

This keeps hosted CLI use compatible with per-user and per-project sandboxes: each user receives a separate workspace root, installed tool cache, and browser/profile boundary.

## Metadata compatibility

`bapX okf` accepts the current bapX OKF v0.1 shape and the additive Google OKF v0.2 trust fields:

- `type`, `title`, `description`, `tags`, and `timestamp`
- `generated.at`
- `verified.at`
- `sources`
- `status`
- `stale_after`

For compatibility, `timestamp` is treated as `generatedAt` when `generated.at` is absent.

## Index output

`index` prints JSON to stdout unless `--output` is provided:

```json
{
  "schema": "bapx.okf.index.v1",
  "root": "/workspace/users/alex/acme",
  "generatedAt": "2026-07-26T08:45:00.000Z",
  "conceptCount": 2,
  "concepts": [
    {
      "id": "connectors/github",
      "path": "connectors/github.md",
      "type": "Channel",
      "title": "GitHub workspace channel",
      "status": "verified",
      "generatedAt": "2026-07-25T08:00:00Z",
      "verifiedAt": "2026-07-26T08:30:00Z",
      "sourceCount": 1,
      "tags": ["github", "repository"],
      "hash": "5f4a91d2"
    }
  ]
}
```

The index intentionally omits full Markdown bodies so it can be stored or handed to another tool without copying the whole corpus.

## Query output

`query` searches titles, descriptions, types, statuses, tags, and Markdown body text:

```json
{
  "schema": "bapx.okf.query.v1",
  "root": "/workspace/users/alex/acme",
  "query": "github repository identity",
  "results": [
    {
      "id": "connectors/github",
      "path": "connectors/github.md",
      "title": "GitHub workspace channel",
      "type": "Channel",
      "status": "verified",
      "sourceCount": 1,
      "excerpt": "Use OAuth for user identity and installation credentials for durable repository automation.",
      "score": 24.5
    }
  ]
}
```

Callers should read the returned source paths before acting. Search results are retrieval evidence, not new facts.
