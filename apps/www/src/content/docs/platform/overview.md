---
title: Platform Overview
description: Current and planned account, billing, connector, API, MCP, and observability ownership in Platform.
---

`platform.bapx.in` is the account and configuration boundary for bapX. It is not a second operating workspace. Every account owns a user-level OKF workspace; businesses live under that user, and projects live inside a business:

```text
root-sandbox/<username>/<business-slug>/projects/<project-slug>/
```

The public `root-sandbox/` name is the customer-facing boundary. Server storage paths are private implementation details.

## Current production state

| Capability                                              | Status                                                                                                                    |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| GitHub signup, login, shared device session, and logout | Implemented. bapX stores no password.                                                                                     |
| User workspace and first business creation              | Implemented when a verified GitHub identity signs in for the first time.                                                  |
| Platform page                                           | Live, authentication-gated information architecture. Account identity is loaded from the current session.                 |
| Customer Agents surface                                 | Live and authentication-gated, with the shared shell, central main-agent transport, and customer-scoped workspace routes. |
| Admin repository import                                 | Implemented for confirmed public GitHub repositories; Admin entitlement is required.                                      |
| Billing checkout and quota enforcement                  | Planned. Razorpay is the intended INR payment owner.                                                                      |
| Provider and connector credential management            | Planned public controls. Customers bring their own credentials.                                                           |
| API-key, MCP-client, and observability management       | Planned public controls.                                                                                                  |
| Shared `api.bapx.in` API/MCP gateway                    | Not served; current routes return 404.                                                                                    |

Static Platform navigation labels describe ownership, not completed workflows. A section is not available merely because it appears in the sidebar.

## Identity and repository authorization

Current signup uses a verified GitHub identity and creates or resumes the user account, workspace, and first business. The production `bapx_session` is shared across bapX subdomains and continues until logout, subject to browser cookie retention.

Repository authorization is a separate GitHub App permission flow. Signing in does not authorize every repository.

## Pricing boundary

The India-first offer is **₹500 per month** with **5 GB** of storage, hosted search, browser sessions, hosted agents and workflows, TTS, STT, and Node.js project subdomains when project hosting is enabled. Self-service subdomain publishing is not currently available. Additional storage is **₹100 per GB per month** up to **100 GB**. Customers bring their own AI-provider and connector credentials. Automated checkout, quota enforcement, and generalized one-click project hosting remain incomplete until deployed and verified.

## Intended Platform ownership

- Account identity, sessions, and user-level workspace ownership
- Subscription, storage quota, and billing state
- Business-owned provider and connector credentials
- API keys and MCP client configuration
- Observability and quality integrations
- Business and project destinations used by Agents/Admin

Platform owns configuration. `agents.bapx.in` owns customer operations; `admin.bapx.in` uses the same operating model with bapX-wide authority.

## Admin and Agents

Opening Admin uses the shared GitHub-backed session, exchanges a single-use short-lived handoff, and revalidates the configured provider-ID entitlement before serving the Admin workspace.

The Admin Projects surface resolves a GitHub repository through the configured GitHub App, shows GitHub's canonical identity, visibility, and default branch, and requires an explicit non-overwriting destination confirmation. Public repository import is implemented. Private cloning remains disabled.

Opening Agents requires a signed-in bapX session. The current surface uses the business main-agent conversation and limits workspace routes to the authenticated customer boundary. Public provider selection and credential storage remain Platform work rather than a completed Agents control.

See [Product surfaces and availability](/docs/introduction/product-surfaces/) for every domain's live boundary.
