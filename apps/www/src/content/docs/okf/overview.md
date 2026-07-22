---
title: Open Knowledge Format
description: OKF is a plain-text knowledge format for humans and AI agents.
---

Open Knowledge Format (OKF) is a convention for structuring knowledge as UTF-8 Markdown, YAML folder indexes, JSON records, and generated Mermaid maps. It is designed for portability, diffability, and agent readability.

OKF is how bapX keeps human documentation and agent context in the same filesystem shape. A user account owns a git workspace, each business owns brand and project folders, and each project owns its own docs and maps. Agents should read folder index files before acting so they can understand ownership, vocabulary, project goals, and source boundaries without guessing from chat alone.

OKF is not trying to copy Google Docs. The useful adaptation is the folder-level entry point: each folder has an `index.yaml` that explains what the folder is for and links to what matters. bapX enhances that with generated `map.mmd` structure so agents can use the same filesystem humans inspect.

## Core files

- `OKF.md` — the workspace-level format and operating contract.
- `index.yaml` — the folder-level YAML index metadata. It describes the folder, important children, and entry points.
- `docs/index.yaml` — the documentation folder index inside a project. This is the first file agents should read before opening deeper project docs.
- `map.mmd` — the generated semantic map for structure, source ownership, routes, docs, entry points, and agent navigation.
- YAML index metadata — machine-readable fields such as `title`, `description`, `type`, `owner`, `status`, and review timestamps.

## Workspace shape

```text
root-sandbox/<username>/
  OKF.md
  index.yaml
  map.mmd
  <business-slug>/
    index.yaml
    DESIGN.md
    brand.css
    map.mmd
    logos/
      index.yaml
      map.mmd
    projects/
      index.yaml
      map.mmd
      <project-slug>/
        index.yaml
        map.mmd
        docs/
          index.yaml
          map.mmd
```

## Agent use

The central bapX agent and specialist agents use OKF to:

- open `index.yaml` first, then `docs/index.yaml` for project documentation, then `map.mmd` for generated structure;
- find project context, docs, assets, repositories, functions, routes, workflows, and maps;
- keep generated work diffable in Markdown, YAML, JSON, and Mermaid instead of opaque database-only state;
- preserve business and project boundaries during automation;
- expose enough semantic structure for MCP clients, coding agents, and browser agents to continue work safely.

OKF is not a claim that every planned capability is shipped. Pages must state whether an operation is implemented, planned, or blocked by missing credentials.
