---
title: MCP Gateway
description: Connect agents through the Model Context Protocol gateway at api.bapx.in/mcp.
---

The planned bapX MCP gateway at `api.bapx.in/mcp` provides authenticated access to approved agents, tools, resources, prompts, and workspace context through the open Model Context Protocol.

MCP is the standard bridge that lets AI applications connect to external systems as tools and context instead of copying private data into prompts. bapX uses that model so Codex, ChatGPT, Claude, GitHub-connected agents, and other MCP clients can manage a business workspace only through scoped, auditable capabilities.

## What bapX should expose

- Workspace and project resources derived from OKF files, docs, and `map.mmd`.
- Tools for approved project, connector, agent, automation, billing, and observability operations.
- Prompt and skill catalogs for the central bapX agent and specialist agents.
- Redacted audit evidence for sensitive actions.

## Current status

The public gateway endpoint and full client-management flow are planned until the authenticated MCP server, access policy, connector approval boundary, and browser-validated Platform controls are implemented. Existing docs and catalog entries must not imply unaudited production MCP mutations are already available.

## Security boundary

Every MCP request must be tied to a user, business, project, connector authorization, and action policy. Payment operations, credential changes, publishing, repository mutations, and destructive filesystem actions require explicit approval and idempotent server-side handling.
