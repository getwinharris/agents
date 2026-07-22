---
title: Open Knowledge Format
description: OKF is a plain-text knowledge format for humans and AI agents.
---

Open Knowledge Format (OKF) is a convention for structuring knowledge as UTF-8 markdown with YAML frontmatter. It's designed for portability, diffability, and agent readability.

OKF is how bapX keeps human documentation and agent context in the same filesystem shape. A user account owns a git workspace, each business owns brand and project folders, and each project owns its own docs and maps. Agents should read OKF files before acting so they can understand ownership, vocabulary, project goals, and source boundaries without guessing from chat alone.

## Core files

- `OKF.md` — the workspace-level format and operating contract.
- `index.md` — the human-readable entry point for a folder.
- `map.mmd` — the generated semantic map for structure, source ownership, and agent navigation.
- `docs/index.md` — the project-level documentation entry point.
- YAML frontmatter — machine-readable metadata such as `title`, `description`, `type`, and review timestamps.

## Workspace shape

```text
users/<username>/
  OKF.md
  map.mmd
  <business-slug>/
    DESIGN.md
    brand.css
    map.mmd
    projects/
      <project-slug>/
        index.md
        map.mmd
        docs/
          index.md
          map.mmd
```

## Agent use

The central bapX agent and specialist agents use OKF to:

- find project context, docs, assets, repositories, and maps;
- keep generated work diffable in Markdown, YAML, JSON, and Mermaid instead of opaque database-only state;
- preserve business and project boundaries during automation;
- expose enough semantic structure for MCP clients, coding agents, and browser agents to continue work safely.

OKF is not a claim that every planned capability is shipped. Pages must state whether an operation is implemented, planned, or blocked by missing credentials.
