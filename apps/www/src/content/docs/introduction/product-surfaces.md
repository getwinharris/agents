---
title: Product surfaces and availability
description: What each bapX domain owns, what is live today, and what remains planned.
---

bapX separates account configuration, day-to-day agent work, enterprise delivery, and developer documentation across distinct domains. A visible navigation item is not evidence that every control behind it is operational. This page records the public availability boundary.

## Live surfaces

| Surface                                        | Current public contract                                                                                                                                                                                                                                                                                    |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`bapx.in`](https://bapx.in)                   | Public product, pricing, and ecosystem landing.                                                                                                                                                                                                                                                            |
| [`platform.bapx.in`](https://platform.bapx.in) | GitHub-backed account/session entry and the Platform information architecture. The static shell is served first; client JavaScript checks the current session and redirects unsigned users. Most management controls are not yet interactive.                                                              |
| [`agents.bapx.in`](https://agents.bapx.in)     | Authentication-gated customer operating surface. The shared shell, central main-agent transport, and customer-scoped workspace routes are implemented. Self-service agent creation, provider selection, team-role management, connector setup, and one-click project hosting are not yet public workflows. |
| [`admin.bapx.in`](https://admin.bapx.in)       | Authentication- and entitlement-gated bapX operating surface with bapX-wide workspace authority. Confirmed public GitHub repository import is implemented; private cloning and complete customer onboarding are not.                                                                                       |
| [`mediahub.bapx.in`](https://mediahub.bapx.in) | Direct, custom-quote enterprise delivery for forward-deployed engineering, AI/data/CRM/ERP systems, commerce, growth infrastructure, and managed implementation. It is commercially separate from the Agents subscription.                                                                                 |
| [`docs.bapx.in`](https://docs.bapx.in)         | Public product, framework, runtime API, SDK, MCP, OKF, ecosystem, and non-sensitive maintainer documentation.                                                                                                                                                                                              |
| [`blogs.bapx.in`](https://blogs.bapx.in)       | Public announcements, releases, research, and tutorials.                                                                                                                                                                                                                                                   |

## Planned public gateway

`api.bapx.in` and `api.bapx.in/mcp` are not served customer endpoints today and return HTTP 404. The API/MCP gateway remains planned until its tenant isolation, authentication, policy, quota, connector, observability, and browser-validated management contracts are implemented and deployed.

The framework API pages under the **Developers** section document the APIs exposed by a Bapx application that you build and deploy. They do not mean that the planned shared `api.bapx.in` gateway is live.

## Platform versus MediaHub

The ₹500/month Agents offer covers the documented hosted workspace plan. MediaHub engagements are scoped and quoted directly for the customer's operational outcome and required infrastructure. MediaHub does not promise free compute, storage, model usage, or pooled provider quotas.

## How availability is proven

A capability is public only after its owning source is merged to `main`, built into an immutable release snapshot, deployed to the stated domain, and verified on the live route. Plans, local branches, screenshots of unmerged work, static placeholder controls, and internal services do not count as shipped.
