---
title: Source Ownership
description: Public ownership map for bapX app surfaces, docs, CLI, runtime, Admin, Agents, and OKF workspaces.
---

bapX uses one tracked web source for public surfaces and one OKF workspace model for customer work. New work belongs in the nearest owning surface, not in duplicate roots or detached scripts.

## Public surfaces

| Surface | Owning source | Purpose |
| --- | --- | --- |
| `bapx.in` | `apps/www/src/pages/` | Public landing, product, login, pricing, and marketing pages |
| `docs.bapx.in` | `apps/www/src/content/docs/` and `apps/www/src/pages/docs/` | Public customer, developer, CLI, API, MCP, OKF, and ecosystem documentation |
| `blogs.bapx.in` | `apps/www/src/content/blogs/` | Public announcements, releases, research, and tutorials |
| `platform.bapx.in` | `apps/www/src/pages/platform/` plus platform server APIs | Account, billing, connector, API key, MCP, and observability control plane |
| `admin.bapx.in` | `apps/www/admin/` plus shared workspace APIs | bapX-wide business operating surface |
| `agents.bapx.in` | shared Admin/Agents operating model | Customer business operating surface |
| `api.bapx.in` | runtime/API/MCP gateway code | Programmatic API and MCP gateway |

## Repository areas

- `packages/runtime/` owns the runtime library: sessions, agents, workflows, tools, persistence, events, and sandbox contracts.
- `packages/cli/` owns supported build, development, docs, map, and blueprint commands.
- `apps/ecosystem-catalog.ts` owns customer-facing connector/catalog entries.
- `.agents/skills/` owns repository-native agent skills.
- `demo/` and `examples/` are canonical product and integration fixtures; do not duplicate them as fake user workspaces.

## OKF customer workspaces

Customer workspaces live under:

```text
root-sandbox/<username>/<business-slug>/projects/<project-slug>/
```

Every user workspace is a git repository. Public docs use `root-sandbox/` as the workspace boundary; the server-owned storage path is internal. Folder metadata is `index.yaml`; generated structure is `map.mmd`; project docs use `docs/index.yaml` and `docs/map.mmd`.

## Where new work belongs

- Product account, billing, connector, API key, MCP, and observability setup belongs in Platform.
- Business execution, agents, automations, projects, team work, and coordination belong in Agents/Admin.
- Supported developer commands belong in the CLI and public docs.
- Private host mechanics and incident procedures stay in internal docs.
