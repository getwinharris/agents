---
title: What is an agent?
description: How bapX agents work — autonomous AI agents running in the cloud for your business and team.
lastReviewedAt: 2026-07-09
---

A **bapX agent** is an AI agent running in the cloud, configured to perform tasks for your business or team. Each agent has a model, instructions, tools, and channels — all managed from your workspace dashboard.

## How agents work

Every bapX agent is built from four components:

1. **A model** — The LLM that powers your agent (Claude, GPT, Gemini, etc.). Choose from any supported provider.
2. **Instructions** — What your agent does. Written in plain language: "Handle customer support for Acme Corp. Process refunds, answer product questions, escalate when stuck."
3. **Tools** — What your agent can access. MCP servers, APIs, databases, file systems, or custom integrations.
4. **Channels** — How your team interacts with the agent. Slack, GitHub, email, Discord, or direct API.

Configure all four from your workspace — no code required.

## Agent lifecycle

| Stage | What happens |
|---|---|
| **Create** | Define name, model, instructions in your workspace dashboard |
| **Deploy** | Agent goes live instantly at `agents.bapx.in/workspace/<name>/` |
| **Connect** | Add channels (Slack, GitHub, email) so your team can use it |
| **Monitor** | View activity logs, conversation history, and usage metrics |
| **Iterate** | Update instructions, swap models, add tools — changes apply immediately |

## Team agents vs. personal agents

bapX agents are team resources, not personal scripts:

- **Workspace-scoped** — Agents belong to your workspace, accessible to all team members with the right role
- **Role-based access** — Admins control who can create, edit, or view agents
- **Shared channels** — Multiple team members can interact with the same agent through shared channels (e.g., a Slack channel)
- **Audit logging** — Every agent action is logged and visible to your team

## When to use agents

bapX agents work best for ongoing, operational tasks:

- Customer support triage and response
- Engineering issue management and code review
- Data processing and report generation
- Project management and task coordination
- Sales lead qualification and follow-up

## Next steps

- [Create your first agent](/getting-started/quickstart/) in minutes
- [Connect channels](/guide/channels/) to your agents
- [Explore the platform](/platform/overview/) for billing, teams, and API keys
