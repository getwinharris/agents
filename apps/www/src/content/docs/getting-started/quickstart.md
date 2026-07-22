---
title: Getting Started
description: Create your paid bapX account, business workspace, and first hosted agent project.
lastReviewedAt: 2026-07-11
---

**bapX** turns 10+ years of marketing and branding operations into hosted agents that work inside your business and project structure. Platform manages account settings, billing, connectors, API keys, MCP configuration, and observability; Agents and Admin are the operating workspaces where the bapX agent coordinates specialist agents, automations, projects, and human work.

## Prerequisites

- **A paid bapX account** — [Sign up](https://platform.bapx.in). The India-first subscription is ₹500/month with 5 GB included, hosted search, browser sessions, hosted agents/workflows, Node.js project subdomains, TTS, and STT. Additional storage is ₹100/GB/month up to 100 GB.
- **An LLM provider key** — Connect your preferred model provider (Anthropic, OpenAI, Google, etc.) in your workspace settings.
- **Team members** (optional) — Invite your team to collaborate on agents and workflows.

## Quick Start

### 1. Create your workspace

Go to [platform.bapx.in](https://platform.bapx.in) and sign up. Platform creates your account, user-level OKF workspace, and first business. New projects and imported GitHub repositories live under `users/<username>/<business-slug>/projects/<project-slug>/`; importing a repository does not bypass the OKF structure.

### 2. Open the bapX agent workspace

Open `agents.bapx.in` for your business workspace. The central **bapX agent** is the primary command surface: it routes work to specialist agents, tools, repository operations, browser/search capabilities, and automations through the existing bapX harness.

From the agent workspace, start a task or create a project agent. Give it a name, choose the model/provider you have connected, and write its instructions:

```yaml
name: customer-support
model: anthropic/claude-sonnet-4-6
instructions: |
  You are a customer support agent for Acme Corp.
  Handle refunds, account issues, and product questions.
  Escalate to human agents when you can't resolve.
```

Project applications may use a hosted Node.js subdomain such as `<projectname>.app.bapx.in` after the project name is set and the hosting operation is implemented for that project.

### 3. Connect channels

Plug your agent into the tools your team already uses:

- **Slack** — Let your team tag the agent in channels
- **GitHub** — Auto-triage issues and PRs
- **Email** — Handle customer tickets via Resend
- **API** — Direct HTTP access to your agent

Configure channels from Platform settings, then use them from Agents/Admin inside the selected business/project scope.

### 4. Invite your team

Add team members to your workspace. Assign roles:

- **Admin** — Full access to billing, settings, all agents
- **Developer** — Create and edit agents, manage channels
- **Viewer** — Monitor agent activity, view logs

## Next Steps

- [Agent concepts](/docs/concepts/agents/) — How bapX agents work
- [Platform guide](/docs/platform/overview/) — Manage billing, API keys, and organisations
- [MCP Gateway](/docs/mcp/overview/) — Connect agents to external tools
