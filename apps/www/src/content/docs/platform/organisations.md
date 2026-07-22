---
title: Organisations
description: How bapX scopes people, projects, Admin, and Agents.
---

A bapX account owns a user-level OKF workspace. Organisations live under that user, and projects live under the selected organisation:

```text
users/<username>/<organisation-slug>/projects/<project-slug>/
```

`admin.bapx.in` and `agents.bapx.in` use the same operating model: people, agents, automations, projects, MCPs, tools, artifacts, audit, and the central bapX agent chat. Admin has bapX-wide authority over `/root/bapx.in`; Agents has customer organisation authority.

`platform.bapx.in` configures the account, subscription, connectors, API keys, MCP access, and observability. It is not a separate workspace surface.
