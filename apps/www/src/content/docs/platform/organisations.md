---
title: Organisations
description: How bapX scopes people, businesses, projects, and Agents.
---

A bapX account owns a user-level OKF workspace. The canonical customer workspace calls the next scope a **business**. Platform may use an Organisation label for membership around that business, but it does not add another directory level:

```text
root-sandbox/<username>/<business-slug>/projects/<project-slug>/
```

`agents.bapx.in` operates within the authenticated customer's business and project boundary. The central main-agent transport is implemented. Team invitations, role management, self-service agent creation, connector setup, and MCP client management are planned public controls rather than completed business workflows.

`platform.bapx.in` owns account, subscription, connector, API-key, MCP, and observability configuration. Its static shell performs a client-side session check and redirects unsigned users; most management controls are not interactive yet. Platform is not a separate workspace surface.

See [Product surfaces and availability](/docs/introduction/product-surfaces/) for the verified deployment boundary.
