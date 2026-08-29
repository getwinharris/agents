---
title: Platform Auth and Workspace Contract
description: Public authentication, workspace, Agents, and connector boundary for bapX.
---

bapX uses Platform for account identity and configuration. Agents uses the configured business workspace to perform work.

## Authentication model

- Platform signup creates or resumes a user account and user-level OKF workspace.
- Two identity methods are supported: **email and password**, and **GitHub**. Either one holds a bapX account on its own; GitHub is no longer required to sign up.
- Passwords are stored as salted scrypt derivations with a per-account 16-byte salt and verified in constant time. Minimum length is 12 characters. An unknown email and a wrong password return the same message after the same work, so neither wording nor timing reveals which addresses are registered.
- The password register and login routes require a same-origin request and cap the request body at 16 KB.
- GitHub identity additionally carries repository authorization, so a repository-backed project still needs a GitHub connection even on a password account.
- A production `bapx_session` cookie is scoped to the `.bapx.in` subdomain family so login works across customer-facing bapX surfaces.
- Repository access is a separate GitHub App permission flow; signing in is not the same as authorizing every repository.
- Provider credentials such as OpenAI, OpenRouter, Anthropic, Google, and connector credentials are workspace settings, not shared global secrets.

Because bapX authenticates through a GitHub **App** rather than a classic OAuth App, the App needs the `email` account permission to read a verified address; the `user:email` scope alone does not grant it. When that permission is absent, sign-in falls back to the public profile email and reports the missing permission rather than failing opaquely.

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
root-sandbox/<username>/<business-slug>/projects/<project-slug>/
```

Platform owns account, billing, storage quota, API keys, connectors, MCP configuration, and observability. Agents owns the customer operating workspace: central bapX agent chat, specialist agents, automations, projects, team work, and connector-driven actions.

## Agents

For customer agent operations, the authenticated gateway derives the canonical business scope as `users/<username>/<business-slug>` and replaces any browser-supplied identity or scope headers before calling the private runtime. The runtime requires its private shared token and rejects a scope whose embedded username differs from the authenticated account. An authenticated customer can call `GET /api/orchestration/workspace-verification` on `agents.bapx.in` to run a read-only workflow that reports the accepted account and scope; it does not read workspace files or perform mutations.

## Connector boundary

Connectors are customer- or business-scoped. A connector should expose:

- clear availability state;
- credential ownership and secret-safe storage;
- health and observability status;
- MCP/API capability when implemented;
- explicit planned/blocked state when production wiring is not yet shipped.
