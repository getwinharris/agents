---
title: Platform Auth and Workspace Contract
description: Public authentication, workspace, Admin, Agents, and connector boundary for bapX.
---

bapX uses Platform for account identity and configuration. Agents/Admin use the configured business workspace to perform work.

## Authentication model

- Platform signup creates or resumes a user account and user-level OKF workspace.
- GitHub identity is used for current bapX sessions and repository authorization.
- Repository access is a separate GitHub App permission flow; signing in is not the same as authorizing every repository.
- Provider credentials such as OpenAI, OpenRouter, Anthropic, Google, and connector credentials are workspace settings, not shared global secrets.

If GitHub OAuth is not configured, sign-in must fail with a clear setup error rather than a broken page. Production OAuth setup is tracked separately from documentation.

## GitHub App setup

bapX uses a GitHub App for the current identity flow and for later repository authorization. GitHub does not let a server create that App silently: an owner of the target GitHub account or organization must approve the App Manifest once in the browser.

When production shows `GitHub login is not configured`, the deployment has not yet captured the GitHub App OAuth credentials. Open:

```text
https://bapx.in/api/auth/oauth/github/manifest?owner=bapXai
```

Review the prefilled GitHub App and create it. GitHub redirects back to bapX with a one-time manifest code; bapX exchanges that code and stores the returned `client_id`, `client_secret`, App `id`, and private key in its platform secret store so the next login attempt can start the OAuth flow.

Repository installation authorization still requires installing the App on the organization or repositories. The installation id is added after that install step.

## Workspace routing

Customer projects live under:

```text
root-sandbox//<username>/<business-slug>/projects/<project-slug>/
```

Platform owns account, billing, storage quota, API keys, connectors, MCP configuration, and observability. Agents/Admin own the operating workspace: central bapX agent chat, specialist agents, automations, projects, team work, and connector-driven actions.

## Admin and Agents

Admin and Agents use the same product model. The difference is authority:

- `admin.bapx.in` operates the bapX workspace with bapX-wide authority.
- `agents.bapx.in` operates a customer business workspace with customer-scoped authority.

Admin is not a separate product with different concepts. It is the wider-scope version of the same people, projects, agents, automations, MCPs, API, connectors, billing, and observability model.

## Connector boundary

Connectors are customer- or business-scoped. A connector should expose:

- clear availability state;
- credential ownership and secret-safe storage;
- health and observability status;
- MCP/API capability when implemented;
- explicit planned/blocked state when production wiring is not yet shipped.
