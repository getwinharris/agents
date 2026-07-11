---
title: Platform Overview
description: Manage your bapX account, businesses, projects, storage, API keys, connectors, and observability.
---

`platform.bapx.in` is the account and business control plane for bapX. Every account owns a user-level OKF workspace. Businesses live under that user, and newly created or imported repositories always live as projects inside a business:

```text
users/<username>/<business-slug>/projects/<project-slug>/
```

Creating an account creates the user workspace and its first business. The website is optional. Business social links are selected during onboarding and describe business pages rather than personal profiles.

The base workspace costs **$5 per month** and includes **5 GB** of storage, hosted agents and workflows, TTS, and STT. Additional storage costs **$1 per GB per month**. Customers bring their own AI-provider and connector credentials.

### Sections

- **Account**: Profile, authentication, and user-level workspace ownership
- **Businesses**: Business identity, members, brand system, social pages, and projects
- **Projects**: New or imported repositories inside the selected business
- **API keys and MCP**: Programmatic access to approved bapX gateways
- **Connectors**: Business-owned external service credentials
- **Observability**: Agent, automation, connector, and project activity scoped by business and subproject
- **Storage and billing**: Included and additional filesystem storage

Platform manages ownership and configuration. `agents.bapx.in` operates the selected business and project; `admin.bapx.in` uses the same operating model with bapX-wide authority.
