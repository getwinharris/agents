# bapX — The Agent Harness Framework

Not another SDK. Build autonomous agents and powerful AI workflows with bapX's programmable TypeScript harness.

```ts
// agents/triage.ts
import { defineAgent, type AgentRouteHandler } from '@bapX/runtime';
import { local } from '@bapX/runtime/node';
import triage from '../skills/triage/SKILL.md' with { type: 'skill' };
import verify from '../skills/verify/SKILL.md' with { type: 'skill' };
import * as githubTools from '../tools/github.ts';

// Give agents the context and autonomy to solve complex tasks:
const instructions = `
Triage a bug report end-to-end: reproduce the bug,
diagnose the root cause, verify whether the behavior is
intentional, and attempt a fix.

...`;

// Expose (and protect) your agents over HTTP:
export const route: AgentRouteHandler = async (_c, next) => next();

// Compose the complete harness your agent needs to do real work,
// complete with virtual, local, or remote container sandbox.
export default defineAgent(() => ({
  model: 'anthropic/claude-sonnet-4-6',
  tools: [...githubTools],
  skills: [triage, verify],
  sandbox: local(),
  instructions,
}));
```

## The framework for building the next generation of agents.

The first agents were built with raw LLM API calls. This worked for simple chatbots and scripted tasks, but not much else.

Agents like Claude Code and Codex broke the mold. These were _real agents._ Autonomous. You give them a task — not a pre-defined series of steps — and trust them to complete it using the context and tools that you provide.

**bapX unlocks this new architecture for agents.** Its built-in TypeScript harness gives any model the context and environment it needs for truly autonomous work: sessions, tools, skills, instructions, filesystem access, and a secure sandbox to run in. Run your agents locally via CLI or deploy them to your hosted runtime of choice.

## Features

Build agents that can safely take action, maintain continuity, and connect to the systems where work already happens.

- **[Agents](https://docs.bapx.in/guide/building-agents/)** — Build agents that can keep context across conversations and events as they autonomously work toward a goal.
- **[Workflows](https://docs.bapx.in/guide/workflows/)** — Run structured automations where your code guides agent reasoning from a clear input to a finished result.
- **[Sandboxes](https://docs.bapx.in/guide/sandboxes/)** — Give agents a secure environment where they can use tools, modify files, and autonomously complete real work.
- **[Durable Execution](https://docs.bapx.in/concepts/durable-execution/)** — Learn how agents preserve progress through failures and restarts with durable recovery for accepted work.
- **[Subagents](https://docs.bapx.in/guide/subagents/)** — Define specialized roles for different tasks, then let your agent delegate work to the right expert.
- **[Tools](https://docs.bapx.in/guide/tools/)** — Give agents typed actions for calling APIs, querying data, and making controlled changes through your application.
- **[Skills](https://docs.bapx.in/guide/skills/)** — Package reusable expertise and workflows that agents can load whenever a task needs specialized guidance.
- **[MCP Servers](https://docs.bapx.in/guide/tools/#connect-mcp-tools)** — Connect agents to authenticated tools and services through the open Model Context Protocol ecosystem.
- **[Observability](https://docs.bapx.in/guide/observability/)** — Monitor your agents and export telemetry with [OpenTelemetry](https://docs.bapx.in/ecosystem/tooling/opentelemetry/), [Braintrust](https://docs.bapx.in/ecosystem/tooling/braintrust/), [Sentry](https://docs.bapx.in/ecosystem/tooling/sentry/), or your own observer.
- **[Channels](https://docs.bapx.in/guide/channels/)** — Receive verified events from Slack, Teams, Discord, GitHub, and more.

## Deploy Anywhere

- **[Node.js](https://docs.bapx.in/ecosystem/deploy/node/)**
- **[Cloudflare Workers](https://docs.bapx.in/ecosystem/deploy/cloudflare/)**
- **[GitHub Actions](https://docs.bapx.in/ecosystem/deploy/github-actions/)**
- **[GitLab CI/CD](https://docs.bapx.in/ecosystem/deploy/gitlab-ci/)**
- **[Daytona](https://docs.bapx.in/ecosystem/sandboxes/daytona/)**
- **[Render](https://docs.bapx.in/ecosystem/deploy/render/)**

## Packages

| Package                                         | Description                                            |
| ----------------------------------------------- | ------------------------------------------------------ |
| [`@bapX/runtime`](packages/runtime)             | Runtime: harness, sessions, tools, sandbox             |
| [`@bapX/cli`](packages/cli)                     | CLI and build/dev tooling (`bapX` binary)              |
| [`@bapX/sdk`](packages/sdk)                     | Client SDK for consuming deployed agents and workflows |
| [`@bapX/opentelemetry`](packages/opentelemetry) | OpenTelemetry tracing adapter                          |
| [`@bapX/postgres`](packages/postgres)           | Postgres persistence adapter                           |
