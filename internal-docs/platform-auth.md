# Platform and authentication implementation

## Ownership

- `apps/www/server.mjs` owns the current HTTP authentication endpoints and subdomain routing.
- `apps/www/src/server/platform-store.mjs` owns password authentication, sessions, filesystem collections, schemas, and initial user/business workspace creation.
- `apps/www/src/pages/login/index.astro` and `apps/www/src/pages/signup/index.astro` own the separate authentication pages.
- `apps/www/src/pages/platform/index.astro` owns the Platform dashboard shell.
- `/root/bapx.in/users/<username>/<business-slug>/` is the generated business workspace. Projects belong below `projects/<project-slug>/`.

Do not add another authentication service, database application, dashboard root, or frontend for this foundation. Extend these owners until the documented architecture changes.

## Shared Platform and operating surfaces

`platform.bapx.in` is the shared account and control plane for customer users and the bapX team. It owns authentication, profiles, businesses, projects, membership and permissions, billing and storage, API keys, connectors, MCP configuration, metrics, and observability.

The operating surfaces apply the same product model to different workspace roots:

| Surface | User | Workspace scope | Purpose |
| --- | --- | --- | --- |
| `agents.bapx.in` | Customer businesses and their teams | `/root/bapx.in/users/<username>/<business-slug>/` and its projects | Operate the customer's people, agents, automations, projects, tools, and business work |
| `admin.bapx.in` | The bapX business and team | `/root/bapx.in/` | Operate bapX itself using the same people, agents, automations, projects, tools, and business-work model |

Admin authority is a wider workspace scope, not a different product or an admin-only agent organisation. CTO, HR, engineering, marketing, operations, users, teams, agents, blogs, docs, projects, and automations are capabilities businesses can use; bapX is the first business operated with them.

## Implemented authentication

| Endpoint | Method | Current behavior |
| --- | --- | --- |
| `/api/auth/signup` | `POST` form | Validates account/business input, creates the account and first business workspace, creates a session, and redirects to `platform.bapx.in` |
| `/api/auth/login` | `POST` form | Accepts username or email plus password, creates a session, and redirects to `platform.bapx.in` |
| `/api/auth/session` | `GET` | Returns the safe account for a valid session or `401` |

Passwords require at least 12 characters and are stored as scrypt hashes. Sessions use random tokens, expire after 30 days, and are delivered through an `HttpOnly`, `Secure`, `SameSite=Lax` cookie.

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

The current four-step form collects:

1. owner name, username, email, and password;
2. business name, business slug, and optional website;
3. selectable business social networks;
4. URLs only for the selected business pages.

The supported selection list currently includes Facebook, Instagram, TikTok, WeChat, LINE, Discord, Medium, Reddit, Pinterest, LinkedIn, YouTube, and X.

## Incomplete wiring

Do not describe these as working externally until implemented and validated:

- Google, GitHub, and OpenAI OAuth callbacks and provider-account linking;
- logout, password reset, email verification, CSRF protection, and rate limiting;
- the intended conversational 10–15-step onboarding flow;
- website or Google Business discovery and brand analysis;
- logo, asset, PDF, presentation, spreadsheet, and document upload;
- connector/tool selection and live credential setup during onboarding;
- generated brand constraints based on uploaded/discovered material;
- dashboard project creation, API-key management, connectors, MCP configuration, billing, and observability operations;
- real metrics and contribution/activity data.

The Platform navigation, zero-state metrics, contribution grid, and operation buttons are currently a static dashboard information architecture. Session lookup and account display are connected.

## Validation

Run the store tests and web build, then validate the served login, signup, and Platform routes in a real browser at desktop and mobile widths. Verify redirects and form behavior against the VPS server; a static Astro build cannot validate the authentication endpoints.
