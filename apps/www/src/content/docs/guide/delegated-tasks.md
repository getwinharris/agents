---
title: Delegated tasks and approvals
description: Durable background work, evidence, connectors, and workspace authorization in bapX Agents.
---

The main bapX agent owns the conversation. It submits bounded background work to the named `research`, `engineering`, or `verification` specialist profile and continues responding without waiting for completion. Specialists publish structured results rather than arbitrary assistant messages.

Every task is scoped to the authenticated account, business workspace, and parent session. Its durable record contains a monotonic version, least-privilege permissions, state history, attempts and leases, progress, approval state, evidence, artifacts, verification state, and a SHA-256 result digest. Stale or duplicate updates are rejected. Expired worker leases return to `queued` during recovery.

The Agents Threads page exposes current task, approval, evidence, and verification state. Admin uses the same operating model for the bapX workspace, with repository and user-management extensions, but does not automatically inherit customer task contents, connector secrets, or approval authority.

## Connector ownership

Platform is the connector control plane. It lists the repository's customer-facing model providers, channels, data services, sandboxes, infrastructure, and observability integrations. Agents can use only connections authorized for its selected business workspace.

OpenAI is a model-provider connector using device/account OAuth. Platform starts the flow and displays the OpenAI verification URL and user code for consent on your device. bapX does not request or persist an OpenAI API key for this flow. OAuth credentials are encrypted inside the business-workspace credential boundary and are never returned by status APIs or telemetry.

Connected OpenAI workspaces currently resolve `openai-codex/gpt-5.6-sol`. The `provider/model` routing contract remains provider-neutral.
