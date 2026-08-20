---
title: Getting Started
description: Sign in to the current bapX surfaces and choose the hosted-product or developer path.
lastReviewedAt: 2026-08-20
---

bapX provides a GitHub-backed account boundary, customer and Admin operating surfaces, a hosted main-agent runtime, and a public TypeScript framework. Some Platform navigation describes the intended control plane before its management controls are interactive, so start with the path that is available today.

## Before you start

- **GitHub identity** — Current bapX signup and login use GitHub OAuth. bapX does not offer password or Google sign-in.
- **Workspace access** — The India-first offer is ₹500/month with 5 GB included. Automated Razorpay checkout and quota enforcement are not yet documented as live self-service controls.
- **Provider credentials** — Customers bring their own model-provider credentials. The public Platform flow for selecting and storing those credentials is not yet complete.

## Hosted product path

### 1. Sign in

Open [Platform](https://platform.bapx.in) and continue with GitHub. A verified identity creates or resumes the user account, user-level OKF workspace, and first business. Public documentation names the customer boundary as:

```text
root-sandbox/<username>/<business-slug>/projects/<project-slug>/
```

Repository authorization is a separate GitHub App permission flow. Signing in does not grant bapX access to every repository.

### 2. Open the customer operating surface

Open [Agents](https://agents.bapx.in). The current authenticated surface provides the shared operating shell and central bapX main-agent transport inside the signed-in customer's workspace boundary.

Self-service creation of arbitrary hosted agents, provider selection, connector setup, team invitations, role management, and one-click project subdomains are not yet public workflows. Do not rely on placeholder Platform navigation for those operations.

### 3. Use the appropriate delivery path

- For a customer workspace or hosted-agent onboarding request, contact the bapX team while the remaining Platform controls are completed.
- For an exclusive enterprise implementation, use [MediaHub](https://mediahub.bapx.in). MediaHub provides direct, custom-quote forward-deployed engineering and is separate from the Agents subscription.
- For framework development, continue with the developer path below.

## Developer path

The public framework supports code-defined agents, workflows, tools, skills, channels, persistence, Node.js builds, and Cloudflare builds. Start with:

1. [Development overview](/docs/reference/development/)
2. [CLI overview](/docs/cli/overview/)
3. [Building agents](/docs/guide/building-agents/)
4. [Runtime Agent API](/docs/api/agent-api/)
5. [SDK overview](/docs/sdk/overview/)

Framework deployment targets are documented developer contracts. They do not create an instant `agents.bapx.in/workspace/<name>` hosted route.

## Check availability before planning

See [Product surfaces and availability](/docs/introduction/product-surfaces/) for the live, partial, auth-gated, and planned boundaries of every bapX domain.
