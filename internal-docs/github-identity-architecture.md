---
type: "Internal Doc"
title: "GitHub identity for bapX — one App, brokered credentials, no per-user app"
description: "Status: design. Written 2026-08-26."
---
# GitHub identity for bapX — one App, brokered credentials, no per-user app

Status: **design.** Written 2026-08-26.
Purpose: decide how customers reach their own GitHub through bapX, and how bapX's
own agent activity is attributed, without any workspace holding a usable token.

Companion to #151 (the operator credential leak, fixed) — that stopped workspaces
acting as the operator; this is the legitimate path that replaces it.

---

## 1. The correction

An earlier draft assumed each customer needed their own GitHub App installation
token minted per tenant. **That is wrong and over-built.**

There is **one bapX GitHub App**. It exists so that bapX's own activity —
comments, checks, pushes — is attributable to bapX, and shows *which agent* did
the work. Customers do not get an App each. A customer only **authenticates to
GitHub through the bapX App**, and installs it where they want bapX to operate.

Installations still exist — a customer installs the one App on their account or
org, choosing all repositories or selected ones. That is GitHub's own screen, not
something bapX builds. What bapX must not do is treat the installation as the
customer's identity, or hand its token to anything.

## 2. Capy is the closest working reference

[Capy](https://docs.capy.ai/integrations/github) has solved exactly this shape,
and its choices should be copied nearly verbatim.

- **A GitHub App, not an OAuth App.** Installed at account or org level, with
  granular repository selection the customer can change at any time.
- **A server-side git proxy.** Every `git` and `gh` call from a sandbox routes
  through Capy's server, which attaches the real credential per request. The
  sandbox never holds it.
- **Short-lived signed grants.** What the sandbox does hold lives ~2 hours,
  refreshes automatically, and is *"useless against GitHub directly"*. Stolen, it
  buys nothing off-platform.
- **Three identities kept separate**, which is the detail worth stealing:

  | Identity | Who it is |
  | --- | --- |
  | Commit author | the customer, if their GitHub account is connected; otherwise the agent |
  | PR author | the customer's account **or** the App, by configuration |
  | Push authentication | **always the App** — visible in branch protection and event feeds |

- **Four permissions only**: Contents (clone/fetch/push), Pull requests (open and
  comment), Checks and commit statuses (receive CI), Metadata (list repositories).

The separation of commit author from push authentication is what makes the
audit trail honest: the human owns the change, the App owns the action, and
branch protection sees a single reviewable actor.

## 3. Kortix converges on the same credential boundary

[Kortix / Suna](https://github.com/kortix-ai/suna) — self-hostable, and explicit
about isolation:

- Each session gets *"its own cloud computer — a disposable, isolated Linux
  sandbox on its own branch"*.
- Credentials are **brokered server-side**, so *"keys never reach the sandbox"*.
- Secrets are *"encrypted at rest, granted per agent, and injected into the
  sandbox at runtime"*.
- Agent work arrives as change requests a human approves before merge.

This is the third independent system to land on *the agent never holds the
secret; it is injected at the boundary* — after Perplexity/1Password and Hermes
`egress`, recorded in `cloud-agent-platform-research.md` §1. Treat it as settled.

## 4. What Claude Code's model warns about

Claude Code installs its App via `/install-github-app`, and the action prefers
**OIDC token exchange** for App authentication. The recurring complaint is token
lifetime: generated workflows carry OAuth tokens that expire in about an hour
**with no automatic refresh**, so integrations fail silently later.

The lesson for bapX is not the transport, it is the failure mode: **design
refresh in from the start.** A connector that works at setup and dies three weeks
later is worse than one that never connected, which was already the conclusion
from ChatGPT's connector constraints.

## 5. The bapX design

**One App.** `bapX`, requesting exactly Capy's four permissions. Its installation
token is used only for bapX-attributed actions — posting a review comment, a
check run, a push. Never handed to a sandbox, never used to represent a customer.

**Users authenticate through it.** The existing GitHub sign-in already uses the
bapX App (`data/platform/secrets/github-app.json`, client id `Iv23lif85gGhxdFAvP5p`).
That same identity is what connects a customer's GitHub — no second app, no
second consent, no per-user registration.

**A credential broker, not a stored token.** The workspace and any sandbox get a
short-lived, bapX-signed grant scoped to one account, one repository, and one
operation class. Git traffic routes through a bapX proxy that swaps the grant for
the real credential per request. This is the natural successor to #151: that fix
removed the operator's credential from workspaces; this ensures nothing usable
replaces it.

**Identity split, following Capy.** Commit author is the customer. Push
authentication is always the App. PR author is configurable, defaulting to the
App so that comments read as bapX and can name which agent produced the change —
which is the entire reason the App exists.

**`bapx-<username>`, private, created on connect.** Each account gets one private
repository holding its OKF tree, business context, and automation data. It is
created through the customer's own installation, in the owner they choose, and
becomes the `origin` of `users/<username>/`. Default name `bapx-<username>`,
default visibility private.

**The connect flow**, matching what Vercel, Netlify and Capy already train users
to expect:

1. Install the bapX App → GitHub's own screen: personal account or org, all
   repositories or selected.
2. bapX records `installation_id`, owner login, owner type, and
   `repository_selection`, **bound to the bapX account id**.
3. In Platform: choose owner from the installations this account owns → choose an
   existing repository **or** create a new one → name prefilled `bapx-<username>`
   → visibility private by default.
4. Every operation mints a fresh short-lived grant. Nothing long-lived is stored.

**Ownership validation is not optional.** Every use of an installation id must
verify it belongs to the requesting bapX account. Roadie's write-up of this exact
failure is blunt: default GitHub App handling *"may put you at risk of leaking
data between GitHub App installations"*. An installation id is attacker-supplied
input until proven otherwise.

## 6. Known trap: selected-repository installations

If the customer installs against *selected repositories*, a repository created
afterwards is **not** covered until the installation is reconfigured — the single
most common Vercel/Netlify support issue. Creating `bapx-<username>` therefore
either happens in an all-repositories installation, or the flow must add the new
repository to the installation and tell the customer plainly when it cannot.

## 7. Sources

Retrieved 2026-08-26.

- [Capy — GitHub integration](https://docs.capy.ai/integrations/github) — vendor primary
- [Kortix / Suna](https://github.com/kortix-ai/suna) — vendor primary
- [Claude Code GitHub Actions](https://code.claude.com/docs/en/github-actions) — vendor primary
- [Authenticating as a GitHub App installation](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/authenticating-as-a-github-app-installation) — GitHub
- [Avoid leaking your customer's source code with GitHub Apps](https://roadie.io/blog/avoid-leaking-github-org-data/) — Roadie
- [Repository permissions and linking](https://docs.netlify.com/build/git-workflows/repo-permissions-linking/) — Netlify
- [Deploying Git repositories with Vercel](https://vercel.com/docs/git) — Vercel
