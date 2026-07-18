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

## Agent harness and provider boundary

The existing pi-based runtime is the bapX agent harness. OpenAI, Codex, Claude, and other model-provider access is authenticated on behalf of the user or organization and supplies inference through that harness. Do not introduce a provider SDK application as a second agent runtime.

## CLI-backed capability inventory

A provider/service integration and a CLI tool are two facets of the same capability. The catalog records customer-visible integrations; the runtime capability manifest records executables, versions, configuration, permissions, health, and availability. Never add a duplicate catalog card only because a CLI becomes available.

| Capability | Existing product owner | CLI contract | Current state |
| --- | --- | --- | --- |
| GitHub | GitHub channel, GitHub App/OAuth work, GitHub Actions deployment | `gh` for authorized repository, issue, PR, workflow, API, and release operations | Connector exists; full shared CLI capability is planned in issue #52 |
| CodeRabbit | Review/diff workflow | `cr review --agent` for structured findings; `cr auth login --self-hosted` may target an organization-provided self-hosted deployment | Planned; findings are evidence, not source of truth |
| Supabase | Supabase database catalog and blueprint | `supabase` for local stack, migrations, linking, type generation, and authorized deployment | Database integration exists; CLI capability is planned |
| Stripe | Stripe channel/package and webhook blueprint | `stripe` for sandbox resources, event streaming, webhook triggering, and authorized management | Connector exists; CLI capability is planned |
| Razorpay | Payments connector/MCP work | `razorpay` for test/live orders, payments, refunds, payment links, subscriptions, settlements, and other explicitly approved operations | Connector, CLI skill, and approval policy are planned |
| Google Workspace | Google Chat channel and customer ecosystem description | `gws` for Drive, Gmail, Calendar, Docs, Sheets, Chat, and other authorized Workspace APIs | Google Chat exists; full Workspace connector and CLI capability are planned |
| Vercel | Vercel Sandbox catalog | `vercel` for authorized project linking, environment, build, deploy, and inspection operations | Sandbox exists; deployment connector and CLI capability are planned |

The Google Workspace CLI repository is published by the `googleworkspace` GitHub organization but explicitly describes itself as not an officially supported Google product and as pre-1.0. Pin an evaluated release and preserve that status in user-facing availability.

## Shared Browser skill

Browser research is one skill available to the main agent and authorized role agents; it is not a separate agent.

- Firecrawl CLI provides search, scrape, crawl, extraction, and optional remote sandbox operations when an organization supplies Firecrawl credentials. Its browser snapshot returns accessibility-tree element references such as `@e1`.
- Browser Use CLI provides low-latency persistent Chrome/Chromium interaction over CDP. Its `state` output annotates interactable DOM elements with numeric indices such as `[0]`; screenshots are separate evidence and may be used by its vision mode.
- Playwright CLI provides deterministic cross-browser tests, locators, traces, screenshots, downloads, and repeatable UI validation using a bapX-owned isolated profile.
- The skill selects the least-powerful applicable operation, returns source URLs and artifacts, treats page content as untrusted, and exposes approval boundaries for authentication, uploads, downloads, payments, publishing, and destructive actions.
- Normalize adapter-specific element references into typed observations without discarding their source adapter. Neither textual refs nor the historical Browser Use WebVoyager score should be described as visual screenshot annotation unless the implementation actually renders and validates a set-of-marks overlay.
- Installations are pinned through an owning tracked package/runtime lifecycle. Do not copy upstream skills wholesale, rely on untracked global installs, attach personal browser profiles, or create a parallel browser service.

Browser Use reported 89.1% on a modified 586-task WebVoyager evaluation with GPT-4o in December 2024. Treat that as a historical vendor-reported result, not a current bapX SLA or proof that the CLI alone achieves the score; the report changed prompts and evaluation code and removed tasks it considered impossible.

## Payment CLI approval boundary

Stripe and Razorpay CLI support does not permit an agent to move money by default. Read-only inspection and test-mode operations may be approved at business/project scope. Live captures, refunds, settlements, payment links, subscriptions, transfers, credential changes, and other monetary or irreversible operations require explicit policy and human approval, with idempotency and redacted audit evidence.

The implementation must first prove these contracts in Admin, including structured failures and redacted telemetry, before the identical shared capability is promoted to Agents.

## Customer boundary

Customers use hosted bapX surfaces: Platform, Agents, MCPs, connectors, supported hosted APIs, and their business/project workspace. They are not instructed to install `@bapX/cli`, build the runtime, operate deployment targets, or install internal SDK packages.

If bapX later publishes a supported external SDK or package, that requires an explicit product decision and a separate public documentation contract.
