# Internal technical ecosystem

This is the internal entry point for bapX agents and team members building and operating the product. These sources are retained in the repository but excluded from `docs.bapx.in` because customers do not install or operate the bapX framework packages.

## Source documentation

| Area | Internal source |
| --- | --- |
| CLI commands, build, development, maps, blueprints, and docs tooling | `apps/www/src/content/docs/cli/` and `packages/cli/` |
| Runtime agent, workflow, action, routing, persistence, event, and error contracts | `apps/www/src/content/docs/api/`, `apps/www/src/content/docs/guide/`, and `packages/runtime/` |
| Internal TypeScript SDK and React bindings | `apps/www/src/content/docs/sdk/`, `packages/sdk/`, and `packages/react/` |
| Deployment targets and adapters | `apps/www/src/content/docs/ecosystem/deploy/`, `apps/www/src/content/docs/guide/targets/`, and target packages |
| Channels, databases, sandboxes, and internal tooling adapters | `apps/www/src/content/docs/ecosystem/`, `blueprints/`, and the owning packages |
| Configuration and contributor implementation reference | `apps/www/src/content/docs/reference/` |
| Canonical functional chat harness | `demo/` |

The source Markdown remains valuable technical documentation even when it is not part of the public content collection. Update it with the owning code until it is migrated into dedicated internal paths. Never restore it to public navigation merely because an internal source exists.

Customer-facing Ecosystem pages are generated from `apps/ecosystem-catalog.ts` by `apps/www/src/pages/docs/ecosystem/`. They intentionally describe business purpose, Platform/MCP ownership, credentials, and availability without copying internal installation or adapter instructions. A catalog item is incomplete if its rendered page or raw `index.md` route is missing.

## Customer boundary

Customers use hosted bapX surfaces: Platform, Agents, MCPs, connectors, supported hosted APIs, and their business/project workspace. They are not instructed to install `@bapX/cli`, build the runtime, operate deployment targets, or install internal SDK packages.

If bapX later publishes a supported external SDK or package, that requires an explicit product decision and a separate public documentation contract.
