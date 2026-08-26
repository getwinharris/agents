---
type: "Internal Doc"
title: "Agent stack 2026 — what bapX should take, and what it should not"
description: "Status: research and recommendations. Written 2026-08-13."
---
# Agent stack 2026 — what bapX should take, and what it should not

Status: **research and recommendations.** Written 2026-08-13.
Companion to `agent-team-architecture-research.md` (which covers Grok subagent
topology) and `platform-api-integration.md` (which covers the API plane).

bapX already has a framework, a CLI, blueprints and a runtime. This document is
about **optimising what exists**, not adopting a new framework. Explicit scope
decision from the user: **no LangChain, no Microsoft Agent Framework.** They are
covered below only to explain what to copy from their documented designs.

---

## 1. The 2026 landscape, and what it means for us

### Frameworks we are not adopting — but should learn from

| Project | The idea worth taking | Why we are not adopting it |
| --- | --- | --- |
| **OpenAI Agents SDK** | Five primitives only: Agents, **Handoffs**, **Guardrails** (input/output validation running *in parallel* with the turn), Sessions, Tracing. Native MCP. | Tightly coupled to OpenAI's runtime. bapX is BYOK/multi-provider by contract. |
| **Anthropic Agent SDK** | Prioritises deterministic accuracy, compliance and safety over raw speed. Usage tiers. | Single-vendor runtime, same reason. |
| **LangGraph** | **Context isolation at the graph-node level** — the feature enterprise CISOs are asking for when agents hold live credentials. | Heavy orchestration; explicitly out of scope. |
| **Microsoft Agent Framework** | **Automatic context compaction** and instruction merging to survive infinite multi-agent loops. | Explicitly out of scope. |
| **Agno / Pydantic AI** | Strict runtime **input/output schemas** to stop agent loop failures, minimal boilerplate. The 2026 developer pushback against heavy orchestration. | Python-first; bapX runtime is TS. The schema discipline transfers. |

**The consolidation that actually matters: MCP has won.** Mastra, OpenAI and
Vercel all ship native MCP support, and agents now plug into 200+ server
implementations without bespoke tool-crafting. bapX already has
`packages/runtime/src/mcp.ts` and a documented (unbuilt) gateway at
`api.bapx.in/mcp`. **This is the correct bet and it is under-built** — see #85
and #103.

### Four things to port into the bapX runtime

1. **Guardrails that run in parallel with the turn** (OpenAI Agents SDK). Not a
   post-hoc check — validation runs alongside execution so a bad turn is halted
   early. Pairs with the approval gates in section 3.
2. **Strict I/O schemas at the runtime boundary** (Agno/Pydantic AI). Most agent
   loop failures are malformed handoffs. Schema-enforce them.
3. **Context compaction** (Microsoft Agent Framework). A durable conversational
   supervisor (issue #44) *will* exceed its window. Compaction is not optional
   for the topology we want; it is the thing that makes it survivable.
4. **Node-level context isolation** (LangGraph). Directly relevant because bapX
   holds customer BYOK provider credentials and connector tokens. A worker must
   not inherit the whole session's credential scope. This is the technical form
   of the ToS boundary in #103.

---

## 2. Grok Bot — the five mechanisms, assessed for bapX

xAI launched Grok Bot in beta on 2026-08-11 with Cursor: a Slack-like workspace
of named AI "teammates" rather than one chatbot. Waitlisted, $200/month.
[`OpenMausBot`](https://github.com/milind-soni/OpenMausBot) reproduced most of it
as open source within ~24 hours by **wiring together existing pieces** rather
than building brains: local CLIs (Claude Code, Codex) for inference, CUA for
computer use, Composio for integrations.

**The replication speed is the strategic signal.** None of the five mechanisms
is a moat. Each is an integration of things that already exist — and, as
section 4 shows, several are already installed on this VPS.

| # | Grok Bot mechanism | bapX position | Verdict |
| --- | --- | --- | --- |
| 1 | **Persistent cloud VM** per account — browser, filesystem, terminal, always-on; all bots share it, so one login is inherited by every bot (no repeated MFA) | bapX has `users/<username>/<business-slug>/` workspaces and a sandbox blueprint family (10 providers) | **Adopt the shared-session idea.** The inherited-login property is the genuinely valuable part and is cheap to implement. Always-on is not — it conflicts with #106 scale-to-zero and this box's 7 GB. |
| 2 | **Computer use / zero-API fallback** — drives a real browser when no API exists; live screen-share and take-over | Blueprint family exists; `hermes computer-use` (cua-driver) already installed | **Adopt.** The fallback is what makes connector coverage unbounded. Take-over-to-clear-a-prompt is the highest-value UX detail. |
| 3 | **Teach a task** — record a demonstration once, abstract to a "Routine" that self-corrects when the UI shifts | Nothing equivalent | **Adopt — biggest differentiator.** Non-technical business owners can author automation without prompt engineering. Fits the India-first SMB tier. |
| 4 | **Agent-to-agent handoffs + group chats** — bots have name/title/scope metadata, route to each other, share files, split work in a thread | Issues #44, #65, #66, #67 already specify this | **Already our roadmap.** Metadata-based routing is the cheap, sound part: each agent's scope description *is* the routing table. |
| 5 | **Approval gates + mobile pings** — auto-review halts on sensitive/financial actions; pauses and pushes to phone on 2FA/CAPTCHA, resumes after human clears it | Approval path referenced in the Hostinger blueprint; no pause/resume/notify loop | **Adopt.** This is the difference between a demo and something a business will let near its money. Directly required by #105 (Hostinger tokens carry billing authority). |

**Where bapX is genuinely differentiated:** none of these products own the
*business workspace*. bapX's OKF-structured `users/<user>/<business>/projects/`
model, with docs and maps as first-class artifacts, is the durable asset. Grok
Bot has a VM and a chat log. Do not trade that structure away chasing feature parity.

---

## 3. Hermes — a working reference implementation, already on this VPS

`hermes` v0.19.0 (Nous Research) is installed at `/usr/local/lib/hermes-agent`
(Python 3.11.15, `/root/.hermes`). It implements a surprising amount of the
above. **Verified by running it, not by reading docs:**

### Kanban — durable multi-agent task graph (tested, works)

> "Durable SQLite-backed task board shared across Hermes profiles. Tasks are
> claimed atomically, can depend on other tasks, and are executed by a named
> profile in an isolated workspace."

Tested on this box:

```
$ hermes kanban init      → board 'default' created (/root/.hermes/kanban.db)
$ hermes kanban create "bapx probe task" --tenant bapx-probe --json
  → {"status":"ready","tenant":"bapx-probe","workspace_kind":"scratch", …}
$ hermes kanban list --tenant bapx-probe
  → ▶ t_0dc709e7  ready  (unassigned)  [bapx-probe]  bapx probe task
```
*(probe task archived afterwards; no residue left on the board)*

Task records carry `tenant`, `workspace_kind` (`scratch` / `worktree` /
`dir:<path>`), `model_override`, `provider_override`, `skills`, `max_retries`,
`session_id`, `workflow_template_id`, `current_step_key`, `parent` (repeatable).

`hermes kanban swarm` builds a **parallel workers → verifier → synthesizer**
graph in one command, with `--tenant`, `--worker PROFILE:TITLE[:SKILL,…]`,
`--idempotency-key`. There is a `daemon`/`dispatch`/`heartbeat`/`watch` set, and
the gateway ticks the dispatcher every 60 s.

**This is a working implementation of what issues #65 and #67 specify** —
durable async sub-agent lifecycle and shared coordination state — including
**native multi-tenancy**, atomic claiming, dependency edges, idempotency keys and
per-task isolated workspaces.

### Other directly relevant surfaces

- `hermes mcp serve` — **run Hermes itself as an MCP server**, exposing
  conversations to other agents. Also `mcp add/catalog/install` with a curated
  one-click catalog and OAuth re-auth.
- `hermes computer-use` — cua-driver install/status/doctor. The same CUA
  primitive OpenMausBot used for Grok Bot parity.
- `hermes serve` — headless JSON-RPC/WebSocket gateway (default `127.0.0.1:9119`).
  Note the June 2026 hardening: `--insecure` is now a **no-op**, and a public
  bind always requires an auth provider. Good precedent for our own gateway.
- `hermes egress` — "iron-proxy egress credential-injection firewall". This is
  section 1's node-level context isolation, in shipped form.
- `hermes security` — OSV.dev supply-chain audit across venv, plugins **and MCP
  servers**. Directly relevant to #105's pin-don't-track concern.
- `hermes gateway` — Telegram/Discord/WhatsApp/Weixin messaging, systemd service.
- `hermes cron`, `webhook`, `skills`, `plugins`, `memory`, `sessions`, `project`.

### Current config state on this VPS

Model `gpt-5.6-sol` via **OpenAI Codex** (logged in, token refreshed 2026-07-26).
Every other provider key is unset; Nous Portal, Qwen, MiniMax and xAI OAuth are
all not logged in. So it is authenticated through exactly one path today.

### Recommendation

**Do not vendor Hermes into the bapX runtime, and do not fork it.** It is Python,
we are TypeScript, and `AGENTS.md` rule 8 forbids parallel tool surfaces.

**Do use it as the design reference, and evaluate it as an operator tool.** Its
kanban schema in particular should be read closely before implementing #65/#67 —
tenant, workspace kind, idempotency key, atomic claim and dependency edges are
exactly the fields those issues need, already proven in a shipped system. Copy
the schema, not the code.

---

## 4. Sandbox, stateless compute, hosting and MCP — the Vercel structure

The user's direction is to follow Vercel's structure. Their 2026 model splits
cleanly into four pieces, and it maps onto bapX's open issues.

### 4.1 Sandbox — "the agent's remote workstation"

Vercel's Sandbox went GA and added **persistent storage and Docker support**,
converting it from "a temporary environment to run AI-generated code" into a
durable workstation: dependencies, cache, dev databases and toolchain all
survive between runs, so nothing is rebuilt from scratch each time.

**This is Grok Bot's persistent VM under a different name** — and it is the
better framing for bapX, because persistence is a property of the *workspace*,
not a permanently running machine.

For bapX: a customer's sandbox should persist its **filesystem and logged-in
sessions** (mechanism 1's inherited-login property) while its **compute** scales
to zero. The existing 10 sandbox blueprints (`sandbox--e2b`, `--daytona`,
`--modal`, `--cloudflare`, `--vercel`, …) are the right abstraction; what is
missing is the persistence contract across them.

### 4.2 Fluid Compute — the scale-to-zero model for #106

Vercel's compute platform for agentic workloads:

- "Scale automatically while minimizing cold starts"
- **"Run background tasks after responding to the user"**
- "Run concurrent workloads in a cost-effective way"
- No "timeouts typical in traditional serverless environments"

The second and fourth points are the ones that matter for agents: an agent turn
routinely outlives an HTTP response, and classic serverless timeouts are why
naive agent hosting fails.

**Apply to #106 as the design target**, with the tiering already recorded there:
static customer sites → no process ever; Node project subdomains → on-demand
start with request-holding and an idle stop. The measured 572 MB idle footprint
of the OmniRoute container (#103) is exactly why per-tenant always-on is not an
option on a 7 GB box.

### 4.3 Exposing MCP — remote server + OAuth

Vercel MCP is a **remote MCP server with OAuth**, consumed by 12 major clients
including Claude Code, Cursor, ChatGPT, Codex CLI and VS Code Copilot. Their
guidance is that an MCP server deployed on Fluid Compute scales automatically
and stays low-latency.

For bapX this validates the plan already documented at `api.bapx.in/mcp` (#85):
**remote, OAuth-authenticated, scoped per business/project.** The gap is
purely that `api.bapx.in` has no Traefik route at all (404) — see the comment
on #85.

Target the same client list. Being reachable from Claude Code, Cursor, ChatGPT
and Codex CLI is the distribution channel; a gateway only our own UI can call is
worth far less.

### 4.4 `mcp-to-ai-sdk` — pin tool definitions, do not resolve them live

Vercel ships a CLI that **generates static tool definitions from any MCP server**,
so the definitions live in your codebase and "only change when you explicitly
update them."

**Adopt this pattern directly.** It is the clean fix for the risk flagged in the
Hostinger blueprint (#105): a server exposing 100+ tools including destructive
and billing-bearing ones must not be able to silently widen an agent's authority
through an upstream update. Generating and committing definitions turns that
into a reviewable diff.

---

## 5. Recommended agent roster

The user asked for research and engineering agents. Grok Bot's lesson is to
build **many small scoped agents, not one oversized prompt** — each with a name,
title and written scope description, because that description *is* the routing
table for handoffs (mechanism 4).

Proposed initial roster, all backed by the existing `blueprints/` and skills:

| Agent | Scope description (doubles as routing metadata) |
| --- | --- |
| **Research** | Web/docs search, source verification, competitive analysis. Produces cited findings, never edits code. Read-only capability mode. |
| **Engineering** | Reads and edits code in a project worktree, runs tests and builds. Read-write + execute in its own workspace only. |
| **Verifier** | Independently checks another agent's claims against source and live behaviour. Read-only. Deliberately cannot fix what it finds — it reports. |
| **Docs** | Keeps `content/docs/`, `internal-docs/` and `map.mmd` truthful and in-sync with shipped behaviour. |
| **Ops** | Deployment, release snapshots, container and Traefik state. Highest-risk scope — every mutating action behind an approval gate. |

Structural notes:

- **Verifier is not optional.** Hermes' swarm makes verifier a first-class node
  (workers → verifier → synthesizer) rather than trusting worker self-reports.
  This session is itself the argument: the map claimed Google OAuth existed and
  `api.bapx.in` was live; both were wrong, and only checking caught it.
- Capability mode per agent (`read-only` / `read-write` / `execute`) as in
  section 1, so Research literally cannot write and Ops cannot act unapproved.
- Each agent's scope text is load-bearing — it is what sibling agents read when
  deciding where to hand off. Write it for that audience.

---

## 6. Sequenced recommendation

1. **Route `api.bapx.in`** (currently 404) — blocks #85 and #103. Cheapest
   unblock on the board.
2. **Ship the API plane** (#103): OmniRoute internal, bapX gateway in front,
   per-user keys, strict BYOK. Pull prebuilt images; never build on the VPS.
3. **Static-site scale-to-zero** (#106 tier 1) — real capacity relief, no cold-start risk.
4. **Guardrails + approval gates + pause/resume/notify** — prerequisite for
   #105's billing-bearing tools, and Grok Bot mechanism 5.
5. **Coordination layer** (#65, #67) — copy Hermes' kanban schema.
6. **Durable conversational supervisor** (#44, #66) — the actual differentiator.
7. **Teach-a-task recording** — highest-value net-new feature; needs 2 and 4 first.

Steps 1–3 are infrastructure debt that everything else sits on. Steps 6–7 are
where bapX stops matching competitors and starts beating them.

## 7. Sources

- [OpenAI Agents SDK](https://openai.github.io/openai-agents-python/)
- [AI SDK 6 — Vercel](https://vercel.com/blog/ai-sdk-6)
- [AI Agents on Vercel](https://vercel.com/kb/guide/ai-agents)
- [mcp-to-ai-sdk — Vercel](https://vercel.com/blog/generate-static-ai-sdk-tools-from-mcp-servers-with-mcp-to-ai-sdk)
- [Vercel AI Cloud 2026 roadmap](https://yage.ai/share/vercel-ai-cloud-platform-survey-en-20260605.html)
- [Introducing Grok Bot — xAI](https://x.ai/news/introducing-grok-bot)
- [OpenMausBot](https://github.com/milind-soni/OpenMausBot)
- [Microsoft Agent Framework at Build 2026](https://devblogs.microsoft.com/agent-framework/microsoft-agent-framework-at-build-2026-announce/)
- [AI Trust and Security Consortium launch](https://www.hpcwire.com/aiwire/2026/08/12/ai-trust-and-security-consortium-launches-to-set-peer-defined-standards-for-enterprise-ai/)
- [Agent framework comparison](https://pub.towardsai.net/top-ai-agent-frameworks-in-2026-a-production-ready-comparison-7ba5e39ad56d)
- Hermes Agent v0.19.0, installed at `/usr/local/lib/hermes-agent` (probed directly on this VPS)
