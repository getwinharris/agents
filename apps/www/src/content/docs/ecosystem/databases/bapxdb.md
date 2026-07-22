---
title: bapXdb
description: OKF, YAML, JSON, and filesystem-backed workspace records for bapX.
lastReviewedAt: 2026-07-22
---

bapXdb is the planned product name for bapX-owned OKF workspace records backed by filesystem directories, Markdown, YAML, JSON collections, JSON Schema, and generated maps.

It is not a replacement for Postgres, Redis, or other runtime persistence adapters. Those adapters store agent runtime state. bapXdb stores product workspace records such as accounts, businesses, projects, connectors, MCP configuration, billing state, maps, docs, artifacts, and audit metadata.

Production bapXdb work must keep the existing OKF hierarchy:

```text
users/<username>/<organisation-slug>/projects/<project-slug>/
```

Schema changes must update public docs, internal docs, map validation, migration/reset behavior, and browser-visible state in the same change.
