---
type: "Internal Doc"
title: "Agent team architecture — competitive research"
description: "Status: research, not a commitment. Written 2026-08-13."
---
# Agent team architecture — competitive research

Status: **research, not a commitment.** Written 2026-08-13.
Purpose: decide how bapX structures a "coding worker team" and how connectors
attach to it, using xAI's Grok stack as the reference point.

---

## 1. Correcting the premise

The working assumption going in was that competitors "only give one tool to a
subagent as a connector, even though it has tools, KG/RAG and a task loop."

**Checked against primary sources — that specific claim is not accurate:**

- Grok **subagents are not limited to one tool.** Per xAI's own subagent guide, a
  spawned subagent "receives a toolset determined by its agent type and optional
  capability mode." `general-purpose` gets the full toolset; `explore` and `plan`
  are deliberately narrower. Access is filtered by capability mode
  (`read-only`, `read-write`, `execute`, `all`) — a policy choice, not a cap of one.
- Grok **connectors are not one tool each.** The Gmail/Calendar connector covers
  both mail and calendar; Salesforce exposes explore, query, create and update.
  Custom MCP servers are supported ("bring your own MCP server").

So the tooling breadth critique does not hold. **The underlying instinct does.**

## 2. The real gap — and it is the one worth building against

The genuine architectural limitation in Grok's model is **conversational
topology, not tool count**:

1. **Subagents report, they do not converse.** The parent "receives the child's
   output — typically a summary — upon completion." There is no continuous
   two-way dialogue while the child works. The parent can poll
   (`get_command_or_subagent_output`) or restart a finished child (`resume_from`),
   but it cannot *talk to it mid-flight*.
2. **Nesting depth is capped at one.** "A subagent cannot spawn its own
   subagents." A subagent cannot decompose its own work.
3. **Fan-out is bounded.** Default 4 parallel subagents, configurable to 8.

The consequence: the topology is **fork/join**, not a team. Work is decomposed
once, executed in isolation, and merged from summaries. There is no persistent
conversational supervisor that keeps talking to workers, re-scopes them as
findings land, or lets two workers reconcile a disagreement directly.

**This is the gap bapX should target.** A long-lived conversational main agent
that spins up, steers, interrupts and re-tasks workers *while they run* — the
"codex voice" model — is a real differentiator, not a reskin.

## 3. What that implies for bapX

Design constraints that follow directly from section 2:

- **Persistent supervisor.** The main agent is a durable session, not a
  dispatcher that blocks on join. It survives worker lifetimes.
- **Bidirectional worker channel.** Workers stream progress and can be
  interrupted, re-scoped, or cancelled mid-task. Summary-on-completion is a
  fallback, not the only channel.
- **Arbitrary nesting, governed by budget.** Depth should be limited by a token
  and wall-clock budget, not a hard depth of 1. A worker that discovers a
  sub-problem should be able to delegate it.
- **Tools scoped by capability, not by count.** Adopt Grok's capability-mode idea
  (`read-only` / `read-write` / `execute`) — it is the right primitive — while
  keeping full toolsets available within a mode.
- **Connectors are multi-tool by default.** One connector exposes a coherent tool
  family. This matches the existing `blueprints/` model, which already defines
  channel/database/sandbox/tooling families rather than single tools.

The existing `blueprints/` directory (18 channel, 8 database, 10 sandbox, 3
tooling specs) is already the right shape for this. New connectors should extend
it rather than introduce a parallel registry — `AGENTS.md` rule 8 requires that.

## 4. Hostinger MCP connector

Requested as a first-class connector. Verified upstream:

- Official server: `hostinger/api-mcp-server`, published by Hostinger.
- **100+ tools** across Websites, VPS, Domains/DNS, Email Marketing,
  Subscriptions & Payments, and Ecommerce.
- Auth: `HOSTINGER_API_TOKEN` environment variable.
- **Requires Node.js 24+.**

This is a good fit and reinforces section 3: it is emphatically a multi-tool
connector, not a single-tool one. It belongs as a `tooling--hostinger.md`
blueprint plus a `packages/hostinger` connector, following the exact pattern of
the existing blueprints.

Note the Node floor: the VPS host runs **v22.22.1**, so the Hostinger MCP server
must run containerised (Node 24+), same conclusion as the OmniRoute assessment.

## 5. Stateless hosting for customer sites

Requirement: when a customer hosts their site on bapX rather than through an
external connector, it should be **serverless — no process running unless a
request arrives** (search crawler, direct URL open, or in-app use).

This is scale-to-zero hosting. Relevant constraints from the current VPS:

- 2 vCPU / 7 GB RAM total, already running Traefik + two app containers.
- Traefik has no native scale-to-zero; it needs an on-demand backend in front of
  the customer container.
- Static customer sites need **no** compute at all — serve from disk via Traefik.
  Only Node.js project subdomains (which the pricing tier explicitly includes)
  need a runtime.

Recommended split, cheapest first:
1. **Static sites → no process, ever.** Serve directly. This covers most cases and
   is genuinely zero-cost at idle.
2. **Node projects → on-demand start.** A small activator sits in front, starts
   the customer container on first request, holds the request, and stops it after
   an idle timeout. Cold start is the tradeoff.

The per-tenant OmniRoute idea (Option B in the API assessment) would use the same
activator, but OmniRoute's cold start and idle footprint make it a poor first
candidate. Prove the mechanism on static and small Node projects first.

## 6. Sources

- [xAI subagents guide](https://github.com/xai-org/grok-build/blob/main/crates/codegen/xai-grok-pager/docs/user-guide/16-subagents.md)
- [xAI connectors docs](https://docs.x.ai/grok/connectors)
- [Hostinger API MCP server](https://github.com/hostinger/api-mcp-server)
- [Hostinger MCP setup tutorial](https://www.hostinger.com/tutorials/how-to-run-hostinger-api-mcp-server/)
- [Grok Build multi-agent overview](https://www.aimadetools.com/blog/grok-build-multi-agent-subagents-guide/)
