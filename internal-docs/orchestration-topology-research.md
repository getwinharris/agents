---
type: "Internal Doc"
title: "Orchestration topology and repo-native knowledge — ChatDev 2.0, MacNet, Multica, Suna"
description: "How comparable systems model multi-agent orchestration, task queues, and queryable knowledge, measured against what bapX actually runs."
---

# Orchestration topology and repo-native knowledge

Status: **research.** Written 2026-08-27.
Purpose: decide how bapX should model multi-agent orchestration, the task/todo
unit, and repo-based queryable knowledge. Sources are the synced upstreams in
`resource-git-for-extract/` and ChatDev's published work.

---

## 1. bapX today, measured

- Orchestration state is a **JSON file plus lock files**
  (`apps/agents-runtime/src/orchestration-store.mjs`). An earlier draft of this
  document claimed a killed process wedges a task until an operator intervenes.
  **That was wrong.** `acquireLock()` records the owner pid and timestamp and
  reclaims a lock once the owner is gone and `lockStaleMs` (60s) has elapsed,
  and tests cover both dead-owner and partial-metadata recovery. The real limits
  are narrower: a bounded stale window during which the task is unavailable, a
  whole-collection rewrite on every mutation, and pid reuse after a container
  restart, where a new process can inherit the recorded pid and read as alive.
- Topology is **fork/join**: the main agent submits bounded work to
  `research` / `engineering` / `verification` specialists and reads summaries
  back. There is no dependency graph and no parallel path that reconverges.
- Knowledge is queryable through `bapX okf index` and `bapX okf query`, which is
  genuinely more than any of the four upstreams offers over its own repository.

## 2. ChatDev — chain → DAG → learned orchestrator

Three generations, and the direction of travel is the useful part.

- **ChatDev 1.0**: a "virtual software company" — CEO, CTO, Programmer running
  a **chain-shaped** sequence of seminars. Roles fixed, topology linear.
- **MacNet** (2024-06): replaces the chain with **directed acyclic graphs**.
  Agents collaborate across arbitrary topologies, and the claim is over a
  **thousand agents without exceeding context limits**. A DAG expresses what a
  chain cannot: A feeds B and C in parallel, D waits for both.
- **ChatDev 2.0 / DevAll**: a **zero-code platform** — agents, workflows and
  tasks defined by configuration, with a visual canvas. Architecture is three
  layers: **Server (state) / Runtime (execution) / Workflow (logic)**.
- **Puppeteer** (NeurIPS 2025): a **learnable central orchestrator** optimised
  with reinforcement learning that dynamically activates and sequences agents.

**What transfers.** The three-layer split is the immediately useful idea, and
bapX already half has it: `apps/www` holds state, `agents-runtime` executes, but
**workflow logic is embedded in code rather than declared**. Separating the
workflow definition is what would let a customer compose agents without a
release.

The DAG matters less than it looks for our current scale, but the reason it
exists does: fork/join forces every dependency through the parent, so the parent
becomes the context bottleneck. That is exactly the topology limit recorded in
`agent-team-architecture-research.md` §2.

## 3. Multica — the task queue is a database, not a file

Read from the synced repository. Multica models orchestration as Postgres tables
with migrations, and the specifics are directly comparable to ours.

`003_task_context.up.sql`:

```sql
ALTER TABLE agent_task_queue ADD COLUMN context JSONB;

CREATE INDEX idx_agent_task_queue_pending
    ON agent_task_queue(agent_id, priority DESC, created_at ASC)
    WHERE status IN ('queued', 'dispatched');

ALTER TABLE daemon_connection
    ADD CONSTRAINT uq_daemon_agent UNIQUE (agent_id, daemon_id);
```

`004_agent_runtime_loop.up.sql` adds an `agent_runtime` table: workspace-scoped,
`runtime_mode IN ('local','cloud')`, `status IN ('online','offline')`,
`last_seen_at`, `metadata JSONB`, unique on `(workspace_id, daemon_id, provider)`.

Three things to take:

1. **A task carries its own context snapshot** — the comment says it exists "so
   daemons have everything needed to execute". A worker does not have to call
   back for context, which is what makes workers relocatable.
2. **Claiming is a partial index, not a lock file.** Pending work is
   `status IN ('queued','dispatched')` ordered by priority then age. There is no
   lock to leak, so there is no stale-lock recovery problem to solve.
3. **Runtimes heartbeat.** `last_seen_at` plus an online/offline status means a
   dead worker is detectable, rather than its task being stuck.

Multica's `internal/` also carries packages bapX lacks entirely and has open
issues for: **`entitlement`** (#145), **`metrics`** and hourly task-usage
backfill commands (#144), `dispatch`, `issueguard`/`issuestatus`/`issueposition`,
`skillbundle`, and `remotemcp`.

## 4. Suna / Kortix — isolation as the unit of work

Each session gets a disposable isolated sandbox **on its own branch**, and
credentials are brokered server-side so keys never reach it. Work returns as a
change request a human approves before merge.

The branch-per-session detail is the one bapX has not taken. Stated in bapX
terms, since `AGENTS.md` reserves *run* for workflow invocations: the boundary is
**one dispatched specialist task** — what `submit_specialist_task` creates and
`FileOrchestrationStore` records. Giving each dispatched task its own branch makes
it reviewable as a diff and abandonable at zero cost, which is a stronger
guarantee than an approval gate on a task record.

## 5. Repo-based queryable knowledge — where bapX is actually ahead

None of the four upstreams indexes its own repository as a queryable knowledge
base. The closest are Hermes' skills index — with a freshness watchdog that
opens an issue when the published index goes stale — and Multica's
`skillbundle`. Both index *skills*, not the whole repository.

bapX indexes every tracked Markdown file with OKF frontmatter and answers
`bapX okf query`. **That is a real differentiator and it should not be
re-derived as a copy of anyone else's design.**

The correction to make is ownership, not concept: the normaliser shipped as
`scripts/okf-normalize.mjs` with `okf:check` / `okf:write` npm scripts, while
`okf` already lives in the CLI (`packages/cli/bin/bapX.ts`, 32 references) and
already exposes `bapX okf index --root --output` and `bapX okf query`. Adding a
parallel script violates the rule in `AGENTS.md` that new automation extends the
existing CLI. It now lives there as `bapX okf normalize --root <path> [--check|--write]`,
where `--check` is the explicit form of the default reporting mode.

Note also what `index.yaml` is actually for here: `bapX map --profile` validates
required workspace files, and `ensureUserWorkspace()` writes one per provisioned
user workspace. It is a consumed format, not decoration — but the repo-root
indexes are not covered by any profile, so nothing validates them yet.

## 6. What bapX should do

1. **Declare workflows instead of coding them** — ChatDev's Workflow layer. bapX
   already has Server and Runtime.
2. **Move the task queue off JSON files** to a real store with a claim index and
   a runtime heartbeat, following Multica. This removes stale-lock recovery as a
   class of bug rather than fixing it again.
3. **Snapshot task context into the task**, so a worker needs no callback.
4. **Branch per dispatched task**, following Suna, so each is reviewable and
   free to abandon. Not per workflow run — `run` is reserved for those.
5. **Keep OKF, and move its tooling into the CLI.** The capability is ahead of
   the field; the packaging is not.

## 7. Sources

Retrieved 2026-08-27. Upstreams synced to HEAD the same day.

- `resource-git-for-extract/multica` — `server/migrations/003_task_context.up.sql`,
  `004_agent_runtime_loop.up.sql`, `server/internal/`
- `resource-git-for-extract/suna` — Kortix, isolated sandbox per session
- `resource-git-for-extract/hermes-agent` — `skills-index-freshness.yml`
- [ChatDev](https://github.com/OpenBMB/ChatDev) — 2.0 / DevAll, three-layer architecture
- [MacNet branch](https://github.com/OpenBMB/ChatDev/tree/macnet) and
  [Scaling LLM-based Multi-Agent Collaboration](https://arxiv.org/pdf/2406.07155)
- [ChatDev 2.0 release coverage](https://www.x-cmd.com/blog/260110/)
