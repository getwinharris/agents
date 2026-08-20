---
title: MCP Gateway
description: Planned customer gateway and the current application-owned Model Context Protocol boundary.
---

The planned bapX MCP gateway is intended to provide authenticated access to approved agents, tools, resources, prompts, and workspace context through the open Model Context Protocol. `api.bapx.in/mcp` is not served today and returns HTTP 404.

MCP is the standard bridge that lets AI applications connect to external systems as tools and context instead of copying private data into prompts. The planned bapX shared gateway would use that model so approved clients can manage a business workspace only through scoped, auditable capabilities. Application-owned MCP servers can apply the same boundary today without implying that the shared gateway is live.

## Planned shared gateway

- Workspace and project resources derived from OKF files, docs, and `map.mmd`.
- Tools for approved project, connector, agent, automation, billing, and observability operations.
- Prompt and skill catalogs for the central bapX agent and specialist agents.
- Redacted audit evidence for sensitive actions.

## Current status

The public gateway endpoint and full client-management flow remain planned until the authenticated MCP server, access policy, connector approval boundary, and browser-validated Platform controls are implemented. Existing docs and catalog entries must not imply unaudited production MCP mutations are already available.

Developers may still implement an MCP server inside their own application or project boundary. That application-owned server is separate from the unserved shared bapX gateway.

## Security boundary

Every MCP request must be tied to a user, business, project, connector authorization, and action policy. Payment operations, credential changes, publishing, repository mutations, and destructive filesystem actions require explicit approval and idempotent server-side handling.
