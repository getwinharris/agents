---
title: Source Ownership
description: Public ownership map for bapX app surfaces, docs, runtime, Agents, and OKF workspaces.
---

bapX uses one tracked web source for public surfaces and one OKF workspace model for customer work. New work belongs in the nearest owning surface, not in duplicate roots or detached scripts.

## Public surfaces

| Surface            | Owning source                                               | Purpose                                                                                                                                                           |
| ------------------ | ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bapx.in`          | `apps/www/src/pages/`                                       | Public landing, product, login, pricing, and marketing pages                                                                                                      |
| `docs.bapx.in`     | `apps/www/src/content/docs/` and `apps/www/src/pages/docs/` | Public customer, developer, API, SDK, MCP, OKF, ecosystem, and non-sensitive maintainer documentation                                                             |
| `blogs.bapx.in`    | `apps/www/src/content/blogs/`                               | Public announcements, releases, research, and tutorials                                                                                                           |
| `mediahub.bapx.in` | `apps/www/src/pages/mediahub/`                              | Direct-client, custom-quote forward-deployed engineering (FDE), enterprise AI/data, commerce, growth, and portfolio funnel; separate from the Agents subscription |
| `platform.bapx.in` | `apps/www/src/pages/platform/` plus platform server APIs    | GitHub-backed account/session entry and control-plane information architecture; most management controls remain planned                                           |
| `agents.bapx.in`   | authenticated customer operating application                | Customer business operating surface                                                                                                                               |
| `api.bapx.in`      | planned runtime/API/MCP gateway code                        | Served and key-gated programmatic API and MCP gateway; per-business credential routing pending                                                                       |

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
- Business execution, agents, automations, projects, team work, and coordination belong in Agents.
- The bapX CLI remains internal repository and maintainer tooling. Non-sensitive maintainer contracts may be documented publicly, but the CLI must not be presented as an installable customer product.
- Private host mechanics and incident procedures stay in internal docs.

See [Product surfaces and availability](/docs/introduction/product-surfaces/) for the customer-facing live and planned boundary. Framework API pages describe application-owned runtime APIs; they do not make `api.bapx.in` a live shared service.
