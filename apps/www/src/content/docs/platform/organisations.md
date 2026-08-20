---
title: Organisations
description: How bapX scopes people, projects, Admin, and Agents.
---

A bapX account owns a user-level OKF workspace. Organisations live under that user, and projects live under the selected organisation:

```text
root-sandbox/<username>/<organisation-slug>/projects/<project-slug>/
```

`admin.bapx.in` and `agents.bapx.in` use the same operating model. Admin has bapX-wide authority over `/root/bapx.in`; Agents has customer organisation authority. The shared shell and central main-agent transport are implemented. Team invitations, role management, self-service agent creation, connector setup, and MCP client management are planned public controls rather than completed organisation workflows.

`platform.bapx.in` owns account, subscription, connector, API-key, MCP, and observability configuration. The current page is an authentication-gated information architecture; most of those controls are not interactive yet. Platform is not a separate workspace surface.

See [Product surfaces and availability](/docs/introduction/product-surfaces/) for the verified deployment boundary.
