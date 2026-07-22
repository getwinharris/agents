---
title: bapX Host
description: Hosted Node.js project runtime and app.bapx.in subdomains.
lastReviewedAt: 2026-07-22
---

bapX Host is the planned managed Node.js hosting layer for customer projects.

Each project may claim a project subdomain in the form:

```text
<projectname>.app.bapx.in
```

Project names are user-settable and may change. A production implementation must reserve slugs globally, protect private projects, preserve redirects after renames, and reject reserved or colliding names before deployment.

The hosting capability is included in the paid bapX subscription. It remains Platform-configured and Agents/Admin-operated: Platform owns the subdomain, quota, billing, and connector settings; Admin/Agents owns the work, deployment intent, approval, and audit.
