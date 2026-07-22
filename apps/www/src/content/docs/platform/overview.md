---
title: Platform Overview
description: Manage your bapX account, businesses, projects, storage, API keys, connectors, and observability.
---

`platform.bapx.in` is the account and business control plane for bapX. Every account owns a user-level OKF workspace. Businesses live under that user, and newly created or imported repositories always live as projects inside a business:

```text
users/<username>/<business-slug>/projects/<project-slug>/
```

Creating an account uses a verified GitHub identity and creates the user workspace and its first organisation. bapX does not store a password. The device session continues until explicit logout, subject to browser cookie retention. Repository authorization remains a separate GitHub App permission flow.

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

Opening `admin.bapx.in` first verifies the existing GitHub-backed bapX session on the central domain, then exchanges a single-use short-lived handoff for an Admin-host session. The server revalidates the configured GitHub provider-ID entitlement before serving the Admin workspace; customer accounts without that entitlement cannot use bapX-wide Admin authority.

### Repository import

The Admin Projects surface resolves a GitHub repository through the configured GitHub App before enabling destination editing or import confirmation. It displays GitHub's canonical repository identity, visibility, and default branch, and suggests the non-overwriting Admin destination before mutation. Public repositories can then continue through the existing confirmed import operation. Private repository metadata may be displayed when authorized, but private cloning is not yet enabled and remains disabled in the Admin UI.

Changing the repository input invalidates the previous resolution and confirmation. A repository must be resolved again before it can be imported, preventing an earlier response from enabling import for a newer input.

### Agents workspace

Opening `agents.bapx.in` requires the same GitHub-backed bapX session. After sign-in, the customer operating surface uses the business main-agent conversation and limits workspace file operations to that account's `users/<username>/workspace` directory. The initial hosted main agent streams a connection check, reasoning, and a scoped workspace-status tool result; selecting and storing customer AI-provider credentials remains a Platform-owned configuration step.
