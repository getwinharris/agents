---
type: "Internal Doc"
title: "How cloud agent platforms do connectors, sandboxes, and deployment"
description: "Status: research. Written 2026-08-13. Cloud-hosted platforms only — no local/desktop agents."
---
# How cloud agent platforms do connectors, sandboxes, and deployment

Status: **research.** Written 2026-08-13. Cloud-hosted platforms only — no local/desktop agents.
Purpose: decide how bapX lets customers connect *their* services, run *their* workloads, and host *their* domains.

Companion to `agent-stack-2026-research.md` (frameworks) and `agent-team-architecture-research.md` (topology).

---

## 1. The headline: everyone converged on a three-tier connector model

The single most transferable finding. **Perplexity Computer** (launched 2026-02-25, cloud multi-agent, "general-purpose digital worker") structures integration in three tiers:

1. **Native connectors** — 400+ prebuilt: Salesforce, Snowflake, HubSpot, Datadog, GitHub, SharePoint, Teams, MySQL, Gmail, Notion, Google Calendar.
2. **MCP for anything not on the list** — teams "build custom connectors for internal systems not on that list."
3. **Browser automation as the floor** — Computer "reads screens, clicks, and navigates web workflows when native APIs aren't available," explicitly for legacy systems with no integration hooks.

This is the right shape and bapX already has all three pieces, unassembled:

| Tier | Perplexity | bapX today |
| --- | --- | --- |
| Native | 400+ connectors | `blueprints/` — 18 channel, 8 database, 10 sandbox, 3 tooling |
| MCP | custom connectors | `packages/runtime/src/mcp.ts`, gateway planned (#85) |
| Browser fallback | reads/clicks screens | sandbox browser profiles (#87); cua-driver available |

**The gap is not capability, it is that the three tiers are not presented as one ladder.** A customer should hit native first, MCP second, browser last, without needing to know which they are using. Today bapX exposes them as unrelated features.

### Credential handling — the detail worth stealing

Perplexity partners with **1Password** so credentials "are never exposed to models or prompts," using dynamic access grants during execution.

This matches what Hermes already ships as `egress` ("iron-proxy egress credential-injection firewall") and what LangGraph calls node-level context isolation. **Three independent systems converged on: the agent never holds the secret; it is injected at the boundary.**

bapX holds customer BYOK provider keys and connector tokens. Adopt this — it is the difference between a prompt-injection incident leaking one request and leaking the customer's Salesforce.

---

## 2. Sandboxes — and a hard benchmark against our own prototype

Cloud sandbox platforms, from a 2026 comparison:

| Platform | Isolation | Resume | Standby | Notable |
| --- | --- | --- | --- | --- |
| **Blaxel** | MicroVM | **sub-25 ms** | unlimited | co-located agent hosting, zero compute cost at standby |
| **E2B** | MicroVM | variable | 30 days | open-source self-hosting |
| **Modal** | gVisor | snapshot | 7 days | GPU/CPU, batch |
| **Daytona** | Linux namespaces | full restart | 30 days paused | IDE integration |
| **CodeSandbox** | MicroVM | snapshot | 2–7 days | browser collaboration |

Three stated requirements for production agent sandboxes:

1. **Persistent state** — filesystem and memory survive between invocations.
2. **Fast resume** — *"anything above 300 ms hurts real-time interactions."* Most platforms target sub-100 ms.
3. **Hardware isolation** — "MicroVMs run a separate kernel for each workload."

### This directly grades our scale-to-zero prototype

The activator measured in #106 achieved **316–463 ms** cold start (Docker `start` of a stopped container, nginx target).

**That is above the 300 ms threshold, and 12–18× slower than Blaxel's sub-25 ms.** And 316 ms was the *floor* — nginx boots faster than any real customer app.

Honest read: the Docker start/stop approach validated the *mechanism* (request-holding, concurrency dedup, idle stop) but **will not hit production-grade resume latency**. Getting under 300 ms needs MicroVM snapshot/restore, not container lifecycle.

Practical consequence for #106, unchanged in direction but sharper:
- **Static customer sites → serve from disk, zero process.** No cold start at all. This is not a compromise; it is strictly better than every platform above for the majority case.
- **Node project subdomains → accept ~500 ms**, or adopt a MicroVM runtime. Do not claim sub-100 ms with the current design.

### Networking is where most sandbox platforms stop

Critical for bapX: *"Only Blaxel explicitly offers production-grade networking"* — static IPs, **custom domain attachment**, proxy routing with secrets injection. The others "lack native networking control when moving to production," making them **development tools, not hosting**.

bapX's pricing already promises "Node.js project subdomains." That is a *hosting* promise, not a sandbox promise. The blueprint sandbox providers (`e2b`, `daytona`, `modal`, …) will not deliver it — they are execution environments. Hosting customer sites on bapX is our own Traefik problem, which is what the #106 activator is for.

---

## 3. Custom domains — the concrete pattern to copy

**Emergent.sh** is the clearest reference for what bapX's hosting tier should feel like:

- Default deploy to `https://<app>.emergent.host` with **no configuration**.
- Custom domains on paid plans, with **automatically provisioned SSL**.
- Domain **search and purchase inside the product** (via IONOS, free first year).
- Managed infrastructure: auto scaling, managed databases, secure environment variables.
- **Full codebase exportable to GitHub** — no lock-in.

The bapX analogue is direct: `<project>.bapx.in` by default, custom domain attach with Let's Encrypt (Traefik already does this for the eight subdomains), and OKF workspaces are already git repos, so the export/no-lock-in property is free.

**The in-product domain purchase is worth serious consideration** — and it is exactly why the Hostinger connector (#105) matters more than it first appeared. Hostinger's `hostinger-domains-mcp` (40 tools) and `hostinger-dns-mcp` (10 tools) would let a bapX agent search, buy, and DNS-configure a customer domain end to end. That reframes #105 from "a connector we should add" to **infrastructure for the hosting tier**.

---

## 4. Authentication — what ChatGPT's constraint teaches

OpenAI's connector model, as a cautionary boundary:

- Custom MCP connectors via developer mode; any remote MCP server registers, all its tools become available.
- Transports: **Streamable HTTP and SSE**.
- Auth: **OAuth 2.1 only**. OpenAI "does not support custom API keys or customer-provided mTLS certificates."
- Without `offline_access`, ChatGPT can lose access when the original authorization expires — refresh may be unavailable.
- **Apps SDK** is the publish path: package an MCP-backed integration with in-chat UI, through a review process.

Two lessons:

1. **OAuth-only is a real constraint that excludes integrations.** Plenty of internal and SMB systems have API keys and no OAuth server. bapX's India-first SMB customers will hit this constantly. **Support both** — OAuth where it exists, scoped API keys where it does not, with the credential-injection boundary from §1 protecting both.
2. **Refresh-token handling is a known failure mode.** Design for expiry from the start; a connector that silently dies weeks later is worse than one that never connected.

---

## 5. Self-hosted reference architecture

**Dify's** self-hosted topology is the closest published analogue to what bapX runs, and worth comparing against:

> Dify API + Worker + Web frontend, a **Plugin Daemon for model providers**, a **Sandbox for code execution**, Weaviate (vectors), MinIO (files), PostgreSQL (metadata), Redis (queueing), and an **nginx reverse proxy routing everything under one public domain**.

bapX equivalents, and the honest gaps:

| Dify component | bapX | Gap |
| --- | --- | --- |
| Reverse proxy, one domain | Traefik, 8 subdomains | none |
| Plugin daemon (model providers) | API plane (#103) | **not routed yet** |
| Sandbox | blueprints, #87 | no lifecycle layer |
| Postgres (metadata) | JSON collections in `data/platform/` | no real DB |
| Redis (queueing) | none | no durable queue |
| MinIO (files) | filesystem | fine at current scale |
| Vector DB | none | no RAG substrate |

The JSON-file store and absent queue are the ones that will bite first. `platform-store.mjs` writes whole collections on every mutation — that is fine for tens of accounts and will not survive thousands.

**Activepieces** is worth noting for a different reason: MIT core, but **embedding and white-label are paid enterprise**. If bapX ever offers white-label, that is the proven place to draw the commercial line.

---

## 6. What bapX should actually do

Ordered by leverage, not effort:

1. **Present connectors as one three-tier ladder** (native → MCP → browser), not three features. This is Perplexity's model and it is what makes coverage feel unlimited to a non-technical customer. Mostly a product/UI change over parts we already have.
2. **Move credentials to injection-at-the-boundary.** Agents never hold customer secrets. Converged on by Perplexity/1Password, Hermes `egress`, and LangGraph. Fold into #107's approval-gate work.
3. **Support API keys as well as OAuth.** ChatGPT's OAuth-only stance is a self-inflicted coverage gap; SMB customers will not clear that bar.
4. **Reposition #105 Hostinger as hosting infrastructure**, not just another connector — domain search, purchase, and DNS for the hosting tier.
5. **Be honest about cold start in #106.** Static → zero process is genuinely best-in-class. Node subdomains at ~500 ms are above the 300 ms bar; either accept and document it, or move to MicroVM snapshots.
6. **Plan the storage migration** off JSON collections before customer count makes it urgent.

## 7. Sources

- [Perplexity Computer enterprise review](https://chatforest.com/reviews/perplexity-computer-enterprise-ask-2026-multi-model-agent-snowflake-salesforce-hubspot/)
- [Perplexity Computer launch coverage](https://aiagentsquare.com/agents/perplexity-computer)
- [Best cloud sandboxes for AI agents 2026 — Blaxel](https://blaxel.ai/blog/best-cloud-sandboxes-ai-agents-2026)
- [Emergent custom domains](https://emergent.sh/blog/how-to-buy-a-custom-domain-on-emergent)
- [Emergent deep dive](https://www.closefuture.io/blogs/deep-dive-emergent-ai-vibe-coding-platform)
- [Developer mode and MCP connectors in ChatGPT](https://help.openai.com/en/articles/12584461-developer-mode-apps-and-full-mcp-connectors-in-chatgpt-beta)
- [Building a ChatGPT App with the Apps SDK](https://3minapi.com/blog/building-chatgpt-app-with-apps-sdk)
- [Dify self-hosted deployment](https://railway.com/deploy/dify-ai-workflow)
- [Best self-hosted AI agents 2026](https://www.ssdnodes.com/learn/best-self-hosted-ai-agents)
