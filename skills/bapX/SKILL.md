---
name: bapX
description: Use when building, debugging, reviewing, or documenting Bapx agents, workflows, channels, skills, tools, sandboxes, targets, routing, persistence, observability, or CLI usage; routes coding agents to version-matched Bapx documentation through the CLI.
---

# Bapx

Use `bapX docs` to read the documentation bundled with the installed `@bapX/cli` version. Choose relevant paths from the catalog below and run `bapX docs read <path>`. If no catalog entry matches your task, run `bapX docs search <query>`, then read the most relevant result with `bapX docs read <path>`.

For example, `bapX docs search "durable execution"` searches with the query `durable execution`. If it returns the path `concepts/durable-execution`, run `bapX docs read concepts/durable-execution` to read that page.

## Documentation Catalog

<!-- bapX-docs-catalog:start -->

```text
api/action-api -- Action API
  Reference for defining reusable finite Actions with @bapX/runtime.
api/agent-api -- Agent API
  Reference for defining agents and running agent operations with @bapX/runtime.
api/data-persistence-api -- Data Persistence API
  Reference for Bapx persistence adapters and stores.
api/errors-reference -- Errors Reference
  Reference Bapx transport errors, runtime failures, and development diagnostics.
api/events-reference -- Events Reference
  Reference runtime activity, attached-agent event types, and global observation APIs.
api/provider-api -- Provider API
  Register custom model providers and override built-in provider transport.
api/routing-api -- Routing API
  Compose Bapx routes in an authored application entrypoint.
api/sandbox-api -- Sandbox Adapter API
  Adapt a provider sandbox SDK into Bapx's public sandbox contract.
api/streaming-protocol -- Streaming Protocol
  Reference for reading Bapx agent conversations and workflow events over Durable Streams.
api/workflow-api -- Workflow API
  Reference for creating and invoking workflows with @bapX/runtime.
cli/add -- bapX add
  Reference for discovering and applying Bapx implementation blueprints.
cli/build -- bapX build
  Reference for creating deployable Bapx application artifacts.
cli/dev -- bapX dev
  Reference for starting a watch-mode local Bapx development server.
cli/docs -- bapX docs
  Reference for listing, reading, and searching the bundled Bapx documentation.
cli/init -- bapX init
  Reference for creating an initial Bapx project configuration file.
cli/map -- Map
  Generate and validate map.mmd files for bapX user, business, demo, and project workspaces.
cli/okf -- bapX okf
  Reference for indexing and querying OKF Markdown knowledge inside one authorized workspace root.
cli/overview -- CLI
  Use the Bapx CLI to configure, develop, exercise, inspect, and build an application.
cli/run -- bapX run
  Reference for executing one agent prompt or workflow invocation from the command line.
cli/update -- bapX update
  Reference for updating integrations from newer Bapx blueprint upgrade guides.
concepts/agents -- What is an agent?
  How bapX agents work — autonomous AI agents running in the cloud for your business and team.
concepts/durable-execution -- Durable Agents
  Understand how Bapx agents and workflows handle server restarts, interrupted connections, and other disruptions.
customer-ecosystem/overview -- Ecosystem
  Connect your bapX business workspace through MCPs, business connectors, APIs, repositories, and communication channels.
ecosystem/channels/discord -- Discord
ecosystem/channels/github -- GitHub
ecosystem/channels/google-chat -- Google Chat
ecosystem/channels/intercom -- Intercom
ecosystem/channels/linear -- Linear
ecosystem/channels/messenger -- Facebook Messenger
ecosystem/channels/notion -- Notion
ecosystem/channels/razorpay -- Razorpay
ecosystem/channels/resend -- Resend
ecosystem/channels/salesforce-marketing-cloud -- Salesforce Marketing Cloud
ecosystem/channels/shopify -- Shopify
ecosystem/channels/slack -- Slack
ecosystem/channels/stripe -- Stripe
ecosystem/channels/teams -- Microsoft Teams
ecosystem/channels/telegram -- Telegram
ecosystem/channels/twilio -- Twilio
ecosystem/channels/whatsapp -- WhatsApp
ecosystem/channels/zendesk -- Zendesk
ecosystem/databases/bapxdb -- bapXdb
ecosystem/databases/libsql -- libSQL
ecosystem/databases/mongodb -- MongoDB
ecosystem/databases/mysql -- MySQL
ecosystem/databases/postgres -- Postgres
ecosystem/databases/redis -- Redis
ecosystem/databases/supabase -- Supabase
ecosystem/databases/turso -- Turso
ecosystem/databases/valkey -- Valkey
ecosystem/deploy/aws -- Deploy Agents on AWS
ecosystem/deploy/bapx-host -- bapX Host
ecosystem/deploy/cloudflare -- Deploy to Cloudflare
ecosystem/deploy/docker -- Deploy Agents with Docker
ecosystem/deploy/fly -- Deploy Agents on Fly.io
ecosystem/deploy/github-actions -- Build Agents for GitHub Actions
ecosystem/deploy/gitlab-ci -- Build Agents for GitLab CI/CD
ecosystem/deploy/node -- Deploy Agents on Node.js
ecosystem/deploy/railway -- Deploy Agents on Railway
ecosystem/deploy/render -- Deploy Agents on Render
ecosystem/deploy/sst -- Deploy Agents on SST
ecosystem/sandboxes/boxd -- boxd
ecosystem/sandboxes/cloudflare -- Cloudflare Sandbox
ecosystem/sandboxes/cloudflare-shell -- Cloudflare Shell
ecosystem/sandboxes/daytona -- Daytona
ecosystem/sandboxes/e2b -- E2B
ecosystem/sandboxes/exedev -- exe.dev
ecosystem/sandboxes/islo -- islo
ecosystem/sandboxes/mirage -- Mirage
ecosystem/sandboxes/modal -- Modal
ecosystem/sandboxes/opensandbox -- OpenSandbox
ecosystem/sandboxes/vercel -- Vercel Sandbox
ecosystem/tooling/braintrust -- Braintrust
ecosystem/tooling/cloud-coding-clis -- Cloud coding CLIs
ecosystem/tooling/opentelemetry -- OpenTelemetry
ecosystem/tooling/sentry -- Sentry
ecosystem/tooling/vitest-evals -- Vitest Evals
getting-started/quickstart -- Getting Started
  Create your paid bapX account, business workspace, and first hosted agent project.
guide/actions -- Actions
  Define finite agent-backed operations that can be reused by workflows and agents.
guide/building-agents -- Agents
  Create an agent, configure its capabilities, and send it messages over time.
guide/channels -- Channels
  Receive verified provider events and connect them to Bapx applications.
guide/database -- Database
  Configure database-backed state for Bapx agents and workflow runs.
guide/evals -- Evals
  Evaluate Bapx agents with repeatable Vitest suites using vitest-evals.
guide/models -- LLM (Models & Providers)
  Select models, configure providers, and tune reasoning behavior in Bapx agents.
guide/observability -- Observability
  Inspect workflow runs, monitor agent activity, and export telemetry from your application.
guide/project-layout -- Project Layout
  Understand the source files and generated output in a Bapx project.
guide/react -- React
  Build React interfaces for live agent conversations and workflow runs.
guide/routing -- Routing
  Compose bapX with application routes, middleware, and custom HTTP ingress.
guide/sandboxes -- Sandboxes
  Give agents a workspace for files and command-driven work.
guide/schedules -- Schedules
  Invoke Bapx workflows or dispatch agent input on a schedule with Cloudflare or Node.js.
guide/skills -- Skills
  Add Agent Skills to Bapx agents and invoke them from sessions.
guide/subagents -- Subagents
  Let agents delegate focused work to named specialists.
guide/targets/cloudflare -- Cloudflare
  Understand the Cloudflare-specific runtime behavior and APIs for Bapx applications.
guide/targets/node -- Node.js
  Understand the Node.js-specific runtime behavior and APIs for Bapx applications.
guide/tools -- Tools
  Give agents application capabilities through custom tools and MCP servers.
guide/workflows -- Workflows
  Create, invoke, and expose finite agent-backed operations.
introduction/why-bapX -- Why bapX?
  Ten years of marketing and branding operations, packaged as hosted agents for your business.
mcp/overview -- MCP Gateway
  Connect agents through the Model Context Protocol gateway at api.bapx.in/mcp.
okf/overview -- Open Knowledge Format
  OKF is a plain-text knowledge format for humans and AI agents.
okf/workspace-maps -- Workspace Maps
  How bapX stores generated map.mmd files for user, business, and project workspaces.
platform/billing -- Platform billing
  India-first bapX subscription and storage limits.
platform/organisations -- Businesses
  How bapX scopes people, projects, Admin, and Agents.
platform/overview -- Platform Overview
  Manage your bapX account settings, billing, API keys, connectors, MCP configuration, and observability.
reference/configuration -- Configuration
  Reference for bapX.config.ts options.
reference/contributing -- Contributing
  Report bugs and propose bapX features through the agents repository.
reference/development -- bapX Development
  Public source, CLI, documentation, and contribution contracts for developers building bapX.
reference/platform-auth -- Platform Auth and Workspace Contract
  Public authentication, workspace, Admin, Agents, and connector boundary for bapX.
reference/shipping -- Shipping Workflow
  Public code-to-docs, validation, and release evidence contract for bapX changes.
reference/source-ownership -- Source Ownership
  Public ownership map for bapX app surfaces, docs, CLI, runtime, Admin, Agents, and OKF workspaces.
sdk/agents -- client.agents
  Invoke persistent agent instances and read their conversations.
sdk/client -- createBapxClient(...)
  Configure an SDK client for a deployed Bapx application.
sdk/errors -- Errors
  SDK HTTP and stream error types.
sdk/events -- Events and records
  SDK event, workflow-run record, and normalized model-turn types.
sdk/overview -- SDK overview
  Reference for consuming deployed Bapx agents and workflows with @bapX/sdk.
sdk/runs -- client.runs
  Inspect and stream HTTP-exposed workflow runs.
sdk/workflows -- client.workflows
  Start workflow runs and receive their run ID.
```

<!-- bapX-docs-catalog:end -->
