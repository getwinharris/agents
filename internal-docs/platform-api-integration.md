---
type: "Internal Doc"
title: "platform.bapx.in — API integration assessment"
description: "Status: assessment complete; API plane deployed internally, gateway not built."
---
# platform.bapx.in — API integration assessment

Status: **assessment complete; API plane deployed internally, gateway not built.**
Written 2026-08-13.
Scope: replacing the `platform.bapx.in` scaffold with `https://github.com/bapXai/api.git`.

This is an operator/decision document. Every claim below was verified against the
live VPS or the cloned repo on the date above.

What has actually shipped so far:

- The OmniRoute API plane runs as an internal container (section 4, "Deployed").
- `apps/www` source: platform page connector grid restored, API section added,
  `docs/platform/api.md` written. **Not deployed** — the live site still serves
  release `141b4476`.

What has NOT shipped: the bapX gateway, per-user API keys, the `api.bapx.in`
Traefik route, and any customer-facing API access.

---

## 1. What bapX actually is today

bapX is an **agent-operations product for businesses**, served as one Astro build
(`apps/www`) across eight subdomains, plus a separate agent harness container.

The commercial model, per the workspace contract in `/root/bapx.in/AGENTS.md`:

- India-first, storage-based pricing: **₹500/month for 5 GB**, +₹100/GB/month to 100 GB.
- Includes hosted agents/workflows, hosted search, browser sessions, Node.js
  project subdomains, TTS and STT.
- **Customers bring their own AI-provider and connector credentials (BYOK).**
- There is no free plan.

That last point is load-bearing for everything in section 3.

### Verified live state (2026-08-13)

| Surface | HTTP | Reality |
| --- | --- | --- |
| `bapx.in` | 200 | Landing. Live. |
| `blogs.bapx.in` | 200 | Live. |
| `mediahub.bapx.in` | 200 | Live. |
| `docs.bapx.in` | 302 → `/getting-started/quickstart/` | Live. |
| `admin.bapx.in` | 303 → `bapx.in/api/auth/admin` | Live, auth-gated. |
| `agents.bapx.in` | 303 → `bapx.in/login/` | Live, auth-gated. |
| `platform.bapx.in` | 200 | **Static scaffold.** See below. |
| `api.bapx.in` | 404 | **Not routed.** Documented but never wired. |

`platform.bapx.in` is a single 8-line `.astro` file
(`apps/www/src/pages/platform/index.astro`). It renders:

- Hardcoded metric tiles (`₹500`, `5 GB`, `₹100`, `100 GB`) — not read from any store.
- A 182-cell "contributions" grid built from `Array.from({length:182})` — permanently empty.
- Seven nav items (`Account`, `Billing`, `Connectors`, `API keys`, `MCP`,
  `Observability`, `Settings`) that are `#anchor` links to **nothing**.
- Two panels whose only actions are outbound links to `docs.bapx.in`.

The one piece of real behavior is a `fetch('/api/auth/session')` that redirects to
`bapx.in/login/` when unauthenticated. Confirmed working.

**Conclusion: the platform control plane does not exist.** It is a visual mock.
There is no account UI, no billing, no connector management, no API-key issuance,
no MCP registry, and no observability behind it.

### Deployment model (important, easy to get wrong)

Traefik (`/docker/traefik-vmm1/docker-compose.yml`, host networking) fronts:

- `bapx-www` → port 3002, serves all eight hosts from **a release snapshot**:
  `/root/bapx.in/releases/agents/141b4476/apps/www/`
- `agents-runtime` → port 3003
- `traefik` → :80/:443, Let's Encrypt

The live snapshot `141b4476` is **2 commits behind** `main` in
`project-packages-git/agents`. Editing the git checkout changes nothing until a
new snapshot is cut and the bind mounts are repointed.

---

## 2. What `bapXai/api` actually is

**It is not a bapX API scaffold.** `https://github.com/bapXai/api.git` is a fork of
`diegosouzapw/OmniRoute` — **OmniRoute v3.8.50**, an AI gateway.

- ~11,577 files, Next.js application, MIT licensed (© 2026 diegosouzapw).
- Aggregates 339 AI providers / 495 models behind one OpenAI-compatible endpoint.
- Ships RTK+Caveman prompt compression, 19 routing strategies, MCP/A2A support,
  a dashboard, Electron desktop build, and a PWA.
- Ships its own `Dockerfile` (stages: `base`, `builder`, `runner-base`,
  `runner-web`, `runner-cli`) and `docker-compose.prod.yml` with Redis.
- Requires Node `>=22.22.2 <23 || >=24.0.0 <27`. **The VPS host runs v22.22.1 —
  just below the floor.** The container path is therefore mandatory; do not try
  to run it against host node.

### Blocking finding A — it is single-tenant

Authentication is `src/app/api/auth/login/route.ts`: a **single management
password** (`verifyManagementPassword`) exchanged for a JWT signed with
`JWT_SECRET`. Supporting surfaces are `auth/{csrf,login,logout,oidc,status}`.

There is **no user table, no per-user accounts, no per-tenant API keys.**
OmniRoute is a single-admin appliance for one operator.

The stated goal — "providing the API for each user" — therefore **cannot be met
by deploying this repo as-is.** Multi-tenancy has to be added by bapX, either
around it or inside it. Section 3 covers both.

### Blocking finding B — provider ToS forbid the obvious business model

OmniRoute's own `docs/reference/FREE_TIERS.md` audits each provider's terms for a
**"self-hosted, single-user personal proxy"** and repeatedly flags that
multi-tenant resale is not permitted. Directly quoted from that file:

- `openrouter` — "ToS explicitly prohibits reselling API access or developing a
  competing service"
- `dify` — "Self-hosted single-user personal proxy is permitted … however,
  multi-tenant deploy…" *(truncated in source)*
- `jina-ai` — free tokens "explicitly non-commercial (CC-BY-NC 4.0)"
- `reka` — "Business Terms prohibit sublicensing or distributing access to third parties"

So the headline OmniRoute proposition — pooling ~1.51B free tokens/month — is
**exactly what bapX must not resell to customers.** Doing so would put bapX in
breach of multiple upstream provider agreements, independent of OmniRoute's MIT
licence (which permits the code use, not the provider access).

**This is already resolved by bapX's own contract.** `AGENTS.md` states customers
bring their own provider credentials. Keeping strict BYOK makes the integration
legitimate: bapX operates routing infrastructure, the customer's own quota is
consumed under the customer's own agreement with each provider.

**Decision required: BYOK-only. bapX free-tier pooling must not be exposed to
customers.** Everything below assumes this.

### Licence obligation

MIT permits the fork, rebrand and commercial use. It requires the copyright
notice and licence text be preserved. Keep `LICENSE` intact and attribute
OmniRoute in `THIRD_PARTY_NOTICES.md` and the platform docs footer.

---

## 3. Integration options

The user's framing — "delete the current platform.bapx.in contents and wrap the
api.git" — cannot be executed literally. `platform.bapx.in` is served by the
`bapx-www` **Astro** container; OmniRoute is a **Next.js** app with its own
server, Redis dependency and SQLite (`better-sqlite3`) store. It cannot be
"wrapped" into the Astro build, and `AGENTS.md` rule 9 forbids adding a second
frontend root to `apps/www`.

It has to run as **its own container behind Traefik**, exactly like
`agents-runtime` already does. That is not a workaround; it is the pattern this
VPS already uses.

### Option A — shared instance + bapX gateway (recommended first step)

```
customer → api.bapx.in (bapX gateway, per-user keys)
             → OmniRoute container (internal only, single admin)
                → provider, using THAT customer's BYOK credentials
```

- bapX issues per-user API keys at `api.bapx.in` — the gateway that is currently
  documented but unrouted. This finally gives that subdomain a reason to exist.
- The gateway maps key → tenant → that tenant's stored provider credentials, then
  calls OmniRoute.
- OmniRoute stays internal, single-admin, never exposed to customers directly.
- `platform.bapx.in` becomes the **control plane UI** for that: key issuance,
  credential entry, usage. This is what the seven dead nav items were always
  meant to be.

Cost: bapX builds the gateway and the tenant-credential store. Benefit: one
OmniRoute instance, no per-customer container sprawl, tenancy owned by bapX where
it belongs.

### Option B — per-tenant instance

One OmniRoute container per customer, provisioned on demand, each with its own
management password and its own provider credentials.

- Genuinely isolates tenants and needs no gateway-side credential mapping.
- Aligns with the "stateless compute / spin up on access" idea — a tenant's
  container starts on first request and stops when idle.
- Cost: OmniRoute is a heavyweight Next.js app with Redis and SQLite. Cold start
  is seconds, not milliseconds, and idle RAM per instance is substantial. **On the
  current 2 vCPU / 7 GB VPS this does not scale past a handful of tenants.**

### Settled 2026-08-13 — per-business instances are required for OAuth

The plane ships **23 provider OAuth implementations** (`src/lib/oauth/providers/`):
claude, codex, cursor, antigravity, kilocode, cline, grok-cli, kiro, zed, trae,
raycast, qoder, github, gitlab-duo, and more — authorization-code, device flow,
and token import. That lets a customer connect an AI client they already pay for
instead of buying API credit. It is the most valuable thing in the repo for our
customers.

But `provider_connections` (`src/lib/db/core.ts:227`) has **no `user_id`,
`tenant_id`, `owner_id` or `account_id` column** — the `email` column holds the
*provider* account's address, not a bapX user. Connections belong to the
instance.

So on a shared plane, **every customer shares one set of provider connections**:
customer A's Claude OAuth would serve customer B's traffic, against A's
subscription. Not configurable — the data model has no user dimension.

OIDC does not solve it either. The plane supports OIDC and bapX can be the IdP,
but the login route's own comment scopes it to "the dashboard admin gate" — it
changes *who the single admin is*, it does not create per-user accounts.

**Therefore: per-customer OAuth requires Option B, one instance per business.**
Option A stays correct for the *shared BYOK API key* path, but cannot deliver
per-user OAuth without patching upstream — exactly the fork divergence the
"use as published" direction rules out. Tracked in #113.

### Recommendation

**Option A now, Option B as the scale path** for customers who need hard
isolation. Option B is not viable on current hardware and should not gate the
first release.

### Sequencing

1. Route `api.bapx.in` in Traefik (currently 404).
2. Stand up OmniRoute as an internal container, not publicly exposed.
3. Build the bapX gateway: per-user key issuance + BYOK credential store.
4. Rebuild `platform.bapx.in` as the control plane over that, keeping the shared
   bapX header/nav/logo used by the other subdomains.
5. Port OmniRoute's `docs/` into `apps/www/src/content/docs/platform/` (which
   today holds only `billing.md`, `organisations.md`, `overview.md`).

Step 4 is where "carry the bapX platform using the header nav logo like other
subdomains" belongs — the current scaffold already uses `bapx-logo-main.svg` but
has its own bespoke sidebar rather than the shared header.

---

## 4. Build verification — FAILED on this VPS

`docker build --target runner-base` was run on the VPS, memory-capped at 5 GB and
CPU-deprioritised. **It failed.**

Stages that succeeded: apt build deps, `npm ci --legacy-peer-deps`, the
`better-sqlite3` node-gyp rebuild, and the `tls-client-node` native postinstall.

Stage that failed: `[builder 10/10] npm run build` — the Next.js 16.2.12
Turbopack production build. It died with **no error output** immediately after
"Creating an optimized production build …", the signature of a SIGKILL.

Confirmed via `dmesg` as a kernel OOM kill:

```
oom-kill:constraint=CONSTRAINT_NONE … global_oom,
  task_memcg=/system.slice/…:docker:…, task=node-MainThread, pid=133772
Out of memory: Killed process 133772 (node-MainThread)
  total-vm:27303116kB, anon-rss:4682012kB
```

Note `constraint=CONSTRAINT_NONE` and `global_oom`: this was a **host-wide** OOM,
not a container cgroup limit. The build process was at 4.68 GB RSS and still
climbing when killed. The kernel also killed an unrelated host process
(`(sd-pam)`, pid 3964100) in the same event.

**The three live containers survived and all eight subdomains were re-verified
healthy afterwards.** But the margin was thin, and this must not be repeated.

**Conclusion: OmniRoute cannot be built on this VPS.** 7 GB total RAM with ~2 GB
already committed to live services leaves too little for a Next.js build of this
size. Do not retry the build here — raising the cap makes a host-wide OOM more
likely, not less.

### The fix: pull, do not build

Upstream publishes prebuilt images to Docker Hub —
`diegosouzapw/omniroute:latest`, 287 tags, ~1.5 GB compressed, linux/amd64.
Deployment on this VPS must **pull a prebuilt image**, never build from source.

For the `bapXai/api` fork specifically, that means images have to be built in CI
(GitHub Actions or any builder with ≥8 GB) and pushed to a registry, with the VPS
only ever pulling. This should be treated as a hard deployment constraint, not a
preference.

The `runner-base` stage remains the correct target: `runner-web` adds Playwright
and Chromium (~300 MB) and is only needed for web-cookie providers
(`gemini-web`, `claude-web`, `claude-turnstile`), which BYOK customers will not use.

### Runtime verification — PASSED

The prebuilt image was pulled and run on this VPS, capped at 1.5 GB and bound to
`127.0.0.1` only (never publicly exposed):

```bash
docker run -d --name omniroute-test --memory=1500m \
  -p 127.0.0.1:20130:20128 -e JWT_SECRET="$(openssl rand -hex 32)" \
  -e NODE_ENV=production diegosouzapw/omniroute:latest
```

Results:

| Check | Result |
| --- | --- |
| Container health | **healthy in ~20 s** |
| Idle memory | **572 MB** |
| Idle CPU | 0.05 % |
| `GET /` | 307 → `/dashboard` |
| `GET /v1/models` | **200**, OpenAI-compatible catalog |
| `GET /api/auth/status` | 200, `{"authenticated":false}` |

Startup log confirms it warmed the model catalog and synced 188 Arena ELO
entries unaided. Redis is **optional** — without `REDIS_URL` it logs
`Using in-memory rate limiting` and runs fine, so `docker-compose.prod.yml`'s
Redis service is not mandatory for a first deployment.

**Note the port: the app listens on `20128`, not 3000**, even though the image
exposes both. Traefik's loadbalancer port must be `20128`.

### Deployed — internal API plane (2026-08-13)

The API plane now runs on this VPS as its **own compose project**, deliberately
separate from `/docker/traefik-vmm1/` so the live site's compose file is
untouched and the plane can be stopped without risk to production:

```
/docker/bapx-api/docker-compose.yml   # image: diegosouzapw/omniroute:latest
/docker/bapx-api/.env                 # BAPX_API_JWT_SECRET (0600)
/root/bapx.in/data/bapx-api           # persisted app data
```

- Container `bapx-api`, `mem_limit: 1500m`, `restart: unless-stopped`.
- Bound to **`127.0.0.1:20130` -> container `20128`**.
- **Not** registered with Traefik. `api.bapx.in` still returns 404, which is
  correct - nothing customer-facing is exposed until the bapX gateway exists.

Verified after start: healthy, `/api/auth/status` 200, `/v1/models` 200 returning
**115 models**. All eight live subdomains re-checked healthy afterwards.

Never add a `build:` stanza to that compose file. See the OOM above.

### Net conclusion

**OmniRoute cannot be built on this VPS, but it runs on it comfortably.**
572 MB idle against ~5 GB free is a workable footprint for one shared instance
(Option A). It is *not* a workable footprint for per-tenant instances at any
scale (Option B) — eight idle tenants would exhaust the box before serving a
single request.

---

## 5. Auth — tested

GitHub OAuth is **implemented and working**. Verified live:

```
GET https://bapx.in/api/auth/oauth/github
→ 303 https://github.com/login/oauth/authorize?client_id=Iv23lif85gGhxdFAvP5p…
   &scope=read:user+user:email&state=…
Set-Cookie: bapx_oauth_state=…; HttpOnly; Secure; SameSite=Lax; Max-Age=600
```

The implementation lives in the **release snapshot**
(`releases/agents/141b4476/apps/www/src/server/github-oauth.mjs`), not in the
tracked repo under a path the app imports — worth noting when searching for it.

Confirmed good practice in that module:
- CSRF state is 32 random bytes, cookie is `HttpOnly` + `Secure` + `SameSite=Lax`,
  scoped to the callback path, 10-minute expiry.
- Only **verified** GitHub emails are accepted; signup is refused outright if
  GitHub returns no verified address.
- Secrets fall back from env to a `0600` file written via atomic rename.
- Session gating verified: `/api/auth/session` returns 401 unauthenticated, and
  `platform`, `admin` and `agents` all correctly redirect to login.

**Google sign-in does not exist.** There is no Google OAuth route, handler, or
config anywhere in the tree. `map.mmd` claimed "Google/GitHub OAuth" — that was
wrong and has been corrected. Adding Google is genuinely new work, not wiring up
something half-built.

Note a design tension worth a decision: GitHub is currently *the identity* — the
login page says "GitHub is the identity for your bapX account and business
workspaces", and account creation provisions a GitHub-backed user repo under
`users/<username>/`. Google sign-in gives no GitHub identity, so either
Google-only accounts cannot get a workspace repo, or GitHub must be linked as a
second step. **This needs an explicit product decision before implementation.**

---

## 6. Evidence

- Repo: `bapXai/api` @ `6143da7`, OmniRoute v3.8.50, MIT © diegosouzapw.
- Live release: `releases/agents/141b4476`, 2 commits behind `main` (`8cd0fa05`).
- Host: 2 vCPU, 7 GB RAM, 48 GB free, node v22.22.1, pnpm 11.10.0.
- Auth model: `src/app/api/auth/login/route.ts` — single management password + JWT.
- ToS constraints: `docs/reference/FREE_TIERS.md` lines 66–144.
