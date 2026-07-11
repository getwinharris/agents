---
title: Getting Started
description: Create your paid bapX account, business workspace, and first hosted agent project.
lastReviewedAt: 2026-07-11
---

**bapX** turns 15+ years of marketing and branding operations into hosted agents that work inside your business and project structure. The platform manages the workspace, hosting, people, credentials, and observability; you bring the AI-provider and connector credentials you choose.

## Prerequisites

- **A paid bapX account** — [Sign up](https://platform.bapx.in). $5/month includes 5 GB storage, agent and workflow hosting, TTS, and STT; additional storage is $1/GB/month.
- **An LLM provider key** — Connect your preferred model provider (Anthropic, OpenAI, Google, etc.) in your workspace settings.
- **Team members** (optional) — Invite your team to collaborate on agents and workflows.

## Quick Start

### 1. Create your workspace

Go to [platform.bapx.in](https://platform.bapx.in) and sign up. bapX creates your user-level OKF workspace and first business. New projects and imported GitHub repositories live under `users/<username>/<business-slug>/projects/<project-slug>/`; importing a repository does not bypass the OKF structure.

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
