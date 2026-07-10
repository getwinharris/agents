---
title: Getting Started
description: Create your bapX account and deploy your first cloud agent for your business or team.
lastReviewedAt: 2026-07-09
---

**bapX** is a cloud agent automation platform for businesses and teams. Deploy AI agents that automate workflows, handle customer operations, manage projects, and collaborate across your organisation — without managing infrastructure.

## Prerequisites

- **A bapX account** — [Sign up](https://platform.bapx.in) for a workspace.
- **An LLM provider key** — Connect your preferred model provider (Anthropic, OpenAI, Google, etc.) in your workspace settings.
- **Team members** (optional) — Invite your team to collaborate on agents and workflows.

## Quick Start

### 1. Create your workspace

Go to [platform.bapx.in](https://platform.bapx.in) and sign up. You'll get a workspace with 5GB of agent runtime, ready to go. No servers to set up, no CLI to install.

### 2. Create your first agent

From your workspace dashboard, click **New Agent**. Give it a name, choose a model, and write your instructions:

```yaml
name: customer-support
model: anthropic/claude-sonnet-4-6
instructions: |
  You are a customer support agent for Acme Corp.
  Handle refunds, account issues, and product questions.
  Escalate to human agents when you can't resolve.
```

Your agent is live instantly at `https://agents.bapx.in/workspace/customer-support/`.

### 3. Connect channels

Plug your agent into the tools your team already uses:

- **Slack** — Let your team tag the agent in channels
- **GitHub** — Auto-triage issues and PRs
- **Email** — Handle customer tickets via Resend
- **API** — Direct HTTP access to your agent

Configure channels from your workspace settings — no code needed.

### 4. Invite your team

Add team members to your workspace. Assign roles:

- **Admin** — Full access to billing, settings, all agents
- **Developer** — Create and edit agents, manage channels
- **Viewer** — Monitor agent activity, view logs

## Next Steps

- [Agent concepts](/concepts/agents/) — How bapX agents work
- [Platform guide](/platform/overview/) — Manage billing, API keys, and organisations
- [MCP Gateway](/mcp/overview/) — Connect agents to external tools
