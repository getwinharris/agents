---
title: Ecosystem
description: Connect your bapX business workspace through MCPs, business connectors, APIs, repositories, and communication channels.
lastReviewedAt: 2026-07-11
---

The bapX ecosystem connects hosted agents and automations to the services your business already uses. Customers configure these connections in Platform and operate them through their business workspace; no bapX CLI installation is required.

## MCPs

MCPs give approved agents access to external tools and information through the Model Context Protocol. A business can register the MCP servers it controls, choose which projects and agents may use them, and manage access through Platform.

MCP management is still being implemented. The public documentation will show exact connection and permission steps only after those controls are wired and browser-validated.

## Business connectors

Connectors represent business-owned credentials and event sources such as:

- Google Workspace and business services
- GitHub repositories and repository events
- communication channels such as email, Slack, Discord, WhatsApp, Telegram, and Teams
- publishing and social business pages
- commerce, advertising, analytics, CRM, and project-management services
- webhooks and supported external APIs

GitHub, Stripe, Razorpay, Supabase, Google Workspace, and Vercel may also expose approved command-line operations to agents through the hosted bapX runtime. These are not customer-installed bapX commands: each operation uses the existing integration, the selected business/project scope, and the user's provider authorization. Payment mutations and other irreversible operations require explicit approval. CLI-backed operations remain planned until their capability status is visible and browser-validated in Admin.

Your credentials remain scoped to your account, business, and projects. Connector setup must not be confused with personal social-profile links collected during onboarding.

## Projects and repositories

New projects and imported GitHub repositories live inside the selected business:

```text
users/<username>/<business-slug>/projects/<project-slug>/
```

Importing an existing repository does not remove the user-level OKF or business/project workspace structure.

## Automations

Automations may begin from a time or recurring schedule, webhook, repository event, connector event, or manual action. They coordinate agents, tools, approvals, and business work inside the selected project.

The dashboard controls for creating and observing these automations are not yet complete. bapX documents a workflow as available only after its Platform or Agents control is implemented and tested.

## Bring your own providers

The $5/month plan includes 5 GB storage, agent/workflow hosting, TTS, and STT. Additional storage costs $1/GB/month. Customers bring their own AI-provider tokens and external connector credentials.

The bapX agent harness remains provider-independent. Connecting OpenAI, Codex, Claude, or another supported model account supplies inference for the existing bapX agent; it does not create a separate provider-owned agent system.

Continue with [Platform overview](/platform/overview/) or [MCP overview](/mcp/overview/).

Browse every available connection in the [Ecosystem directory](/ecosystem/).
