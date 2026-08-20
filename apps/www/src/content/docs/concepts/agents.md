---
title: What is an agent?
description: The code-defined Bapx agent contract and the current hosted bapX product boundary.
lastReviewedAt: 2026-08-20
---

A **Bapx agent** is a code-defined runtime resource with a model, instructions, tools, skills, optional subagents, and an application-owned route. A deployed Bapx application can expose agent instances through its Node.js or Cloudflare runtime.

The hosted bapX product currently exposes one central main-agent transport inside the authentication-gated Agents surface. It does not yet provide dashboard creation and instant hosting for arbitrary customer-defined agents.

## Framework agent contract

Every agent definition can combine:

1. **Model** — A provider/model specifier supplied by the application or operation.
2. **Instructions** — The agent's role and operating constraints.
3. **Tools and skills** — Project-owned capabilities available to the agent.
4. **Subagents** — Named specialist profiles used for delegated work.
5. **Persistence and runtime** — Application-selected storage, Node.js or Cloudflare target, and authored routing.

Agents are TypeScript modules, not records created by a hosted dashboard. Start with [Building agents](/docs/guide/building-agents/) and the [Agent API](/docs/api/agent-api/).

## Developer lifecycle

| Stage       | Supported behavior                                                                            |
| ----------- | --------------------------------------------------------------------------------------------- |
| **Define**  | Author the agent, model, instructions, tools, skills, and subagents in source.                |
| **Build**   | Use the bapX CLI to create a Node.js or Cloudflare deployment artifact.                       |
| **Deploy**  | Deploy the generated artifact through an application-owned hosting target and route.          |
| **Connect** | Add code-backed channels, APIs, SDK clients, or MCP servers supported by that application.    |
| **Observe** | Use the runtime event, conversation, persistence, tracing, and application logging contracts. |

There is no supported instant `agents.bapx.in/workspace/<name>` deployment route.

## Hosted bapX boundary

The live `agents.bapx.in` route provides the shared operating shell, an authenticated main-agent gateway, and customer-scoped workspace APIs. The following remain planned public product workflows:

- Creating arbitrary agent definitions from the browser
- Selecting and storing model-provider credentials in Platform
- Assigning workspace team roles
- Enabling connectors with one click
- Publishing project-specific hosted subdomains
- Managing shared API/MCP clients through `api.bapx.in`

See [Product surfaces and availability](/docs/introduction/product-surfaces/) for the current deployment boundary.

## Good agent workloads

Agents are useful when an application can give them a clear scope, tools, review boundary, and evidence contract—for example support triage, engineering issue work, data processing, project coordination, or sales qualification. High-impact mutations should remain behind application authorization and explicit approval.
