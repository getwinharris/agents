# Platform and authentication implementation

## Ownership

- `apps/www/server.mjs` owns the current HTTP authentication endpoints and subdomain routing.
- `apps/www/src/server/platform-store.mjs` owns GitHub-linked accounts, persistent device sessions, filesystem collections, schemas, and initial user/business workspace creation.
- `apps/www/src/pages/login/index.astro` and `apps/www/src/pages/signup/index.astro` own the separate authentication pages.
- `apps/www/src/pages/platform/index.astro` owns the Platform dashboard shell.
- `/root/bapx.in/users/<username>/<business-slug>/` is the generated business workspace. Projects belong below `projects/<project-slug>/`.

Do not add another authentication service, database application, dashboard root, or frontend for this foundation. Extend these owners until the documented architecture changes.

## Shared Platform and operating surfaces

`platform.bapx.in` is the shared account and settings control plane for customer users and the bapX team. It owns authentication, profiles, business identity, membership and permissions, billing and storage, API keys, connectors, MCP configuration, metrics, and observability. It must not be treated as a separate operating workspace; Admin and Agents own the day-to-day people, agents, automations, projects, PRs, context, and chat surfaces.

The operating surfaces apply the same product model to different workspace roots:

| Surface | User | Workspace scope | Purpose |
| --- | --- | --- | --- |
| `agents.bapx.in` | Customer businesses and their teams | `/root/bapx.in/users/<username>/<business-slug>/` and its projects | Operate the customer's people, agents, automations, projects, tools, and business work |
| `admin.bapx.in` | The bapX business and team | `/root/bapx.in/` | Operate bapX itself using the same people, agents, automations, projects, tools, and business-work model |

Admin authority is a wider workspace scope, not a different product or an admin-only agent organisation. CTO, HR, engineering, marketing, operations, users, teams, agents, blogs, docs, projects, and automations are capabilities businesses can use; bapX is the first business operated with them.

## Implemented authentication

| Endpoint | Method | Current behavior |
| --- | --- | --- |
| `/api/auth/oauth/github` | `GET` | Starts GitHub OAuth with a short-lived state cookie. |
| `/api/auth/oauth/github/manifest` | `GET` | Opens GitHub's App Manifest registration page by POSTing the manifest for the configured owner. |
| `/api/auth/oauth/github/manifest/callback` | `GET` | Exchanges GitHub's one-time manifest `code`, stores the returned App OAuth credentials in the platform secret store, and sends the operator back to login. |
| `/api/auth/oauth/github/callback` | `GET` | Validates state, resolves a verified GitHub identity, creates or loads the account, and creates a device session. |
| `/api/auth/logout` | `POST` | Revokes the current device session and clears its cookie. |
| `/api/auth/session` | `GET` | Returns the safe account for a valid session or `401` |

No bapX password is collected or stored. Sessions use random server-side tokens and persist until logout. The browser cookie is `HttpOnly`, `Secure`, and `SameSite=Lax`; active session checks refresh its browser retention window.

## Filesystem persistence

Platform-owned collections and schemas live under the VPS workspace, outside the static site build:

```text
/root/bapx.in/data/platform/
  collections/accounts.json
  collections/sessions.json
  schemas/accounts.schema.json
  schemas/sessions.schema.json
```

Writes use a temporary file followed by rename. Collection schema version is currently `1`.

Signup initializes a real user Git repository and first business. It copies the canonical workspace `OKF.md` and creates the required indexes, maps, `DESIGN.md`, `brand.css`, `logos/`, `projects/`, plus business `collections/business.json` and `schemas/business.schema.json`.

## Current signup surface

GitHub is the only bapX identity provider. The login and signup pages both start the same
GitHub authorization flow; bapX does not collect a password. A verified GitHub identity
creates or resumes the account and persistent device session. Business onboarding remains
a separate Platform operation after authentication.

OpenAI, Google, Anthropic, and other providers are connectors or model providers. They are
not bapX login methods.

## Production GitHub configuration

The `flue-www` service receives these values from the VPS deployment environment:

| Variable | Purpose |
| --- | --- |
| `GITHUB_CLIENT_ID` | Public client identifier for the bapX GitHub App. |
| `GITHUB_CLIENT_SECRET` | Server-only secret used to exchange the callback code. Never commit or log it. |
| `GITHUB_OAUTH_CALLBACK_URL` | Exact callback URL; production uses `https://bapx.in/api/auth/oauth/github/callback`. |

The GitHub App is owned by the approved GitHub account or organization and is configured
through GitHub's App Manifest flow. Repository installation authorization is separate from
identity authorization. Do not persist GitHub access tokens in account collections or
workspace files.

Production compose may read these variables from `/docker/traefik-vmm1/.env`. The web
service can also store credentials returned by the GitHub App Manifest callback in
`data/platform/secrets/github-app.json` with `0600` permissions. Environment variables win
over stored values. A missing or empty `GITHUB_CLIENT_ID`/stored `clientId` makes
`/api/auth/oauth/github` redirect back to
`/login/?error=GitHub%20login%20is%20not%20configured`.

To create the GitHub App without clicking through the whole settings UI:

1. Open `https://bapx.in/api/auth/oauth/github/manifest?owner=bapXai` in a browser
   authenticated as an owner of the target GitHub organization.
2. Review the prefilled GitHub App manifest and click **Create GitHub App**.
3. GitHub redirects back to
   `https://bapx.in/api/auth/oauth/github/manifest/callback?code=...`; the server exchanges
   the one-time code and stores the returned App OAuth credentials.
4. If an operator needs to override the stored values manually, update
   `/docker/traefik-vmm1/.env` with the returned values:

   ```dotenv
   GITHUB_CLIENT_ID=<client_id>
   GITHUB_CLIENT_SECRET=<client_secret>
   BAPX_GITHUB_APP_ID=<id>
   BAPX_GITHUB_APP_PRIVATE_KEY=<pem with newlines escaped as \n>
   ```

   Add `BAPX_GITHUB_INSTALLATION_ID` only after the app has been installed on the
   repositories/org account and the installation id is known.
5. Recreate the service after manual environment changes so compose interpolates the new
   values:

   ```bash
   docker compose --project-directory /docker/traefik-vmm1 -f /docker/traefik-vmm1/docker-compose.yml up -d --force-recreate flue-www
   ```

After changing credentials, recreate the `flue-www` container and verify that the start
endpoint redirects to `github.com/login/oauth/authorize`, the callback returns to the exact
configured URL, a verified identity reaches Platform, and no credential appears in HTML,
logs, account data, or the repository.

## Incomplete wiring

Do not describe these as working externally until implemented and validated:

- explicit logout UI, CSRF protection beyond the OAuth state check, and rate limiting;
- provider-account and connector linking for OpenAI, Google, Anthropic, and other services;
- the intended conversational 10–15-step onboarding flow;
- website or Google Business discovery and brand analysis;
- logo, asset, PDF, presentation, spreadsheet, and document upload;
- connector/tool selection and live credential setup during onboarding;
- generated brand constraints based on uploaded/discovered material;
- API-key management, connectors, MCP configuration, Razorpay billing, storage quotas, and observability operations;
- real metrics and contribution/activity data.

The Platform navigation, zero-state metrics, contribution grid, and operation buttons are currently a static dashboard information architecture. Session lookup and account display are connected.

## Validation

Run the store tests and web build, then validate the served login, signup, and Platform routes in a real browser at desktop and mobile widths. Verify redirects and form behavior against the VPS server; a static Astro build cannot validate the authentication endpoints.
