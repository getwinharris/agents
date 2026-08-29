---
type: "Internal Doc"
title: "Task coordination patterns to copy from teams, multica and paperclip"
description: "Concrete implementation methods for what-is-going-on, what-needs-doing, and team collaboration, measured against the bapX orchestration task."
---

# Task coordination patterns worth copying

Status: **research with implementation targets.** Written 2026-08-29.
Sources are the working repositories, read directly — `getwinharris/teams`
(2,730 TS files) and `multica-ai/multica`, synced to HEAD.

The instruction was to take **ideas and implementation methods**, not the
products. Each section below is a pattern, the evidence for it, and what it
would change in `apps/agents-runtime/src/orchestration-store.mjs`.

---

## 1. What bapX has today

A task record carries: `id` (UUID), `sessionId`, `profile`, `objective`,
`state`, `version`, `context`, `result`, `createdAt`.

Three consequences:

- **Nothing is addressable by a human.** A UUID cannot be spoken, typed into
  chat, or referenced in an issue.
- **Nothing links a task to why it exists.** `objective` is free text; there is
  no relation to an issue, PR, or parent task.
- **Nothing is measurable.** `createdAt` only. There is no record of when work
  was dispatched, started, or finished, so no duration can be computed.

## 2. Human-readable identifiers — teams

`plugins/task/src/index.ts`:

```ts
export interface Task extends AttachedDoc {
  kind: Ref<TaskType>
  status: Ref<Status>
  isDone?: boolean
  number: number
  assignee: Ref<Person> | null
  dueDate: Timestamp | null
  identifier: string
  rank: Rank
}
```

`identifier` sits beside the internal id, backed by a per-project `number`. That
is what makes "TASK-7 finished, TASK-8 is still running" possible in a
conversation. Our supervisor can only say the UUID, which no human will read.

**Take:** a per-workspace counter and a derived `identifier`. Cheap, additive,
and immediately improves what the main agent can say.

## 3. Status as data, not a hardcoded enum — teams

`status: Ref<Status>` plus `ProjectStatus` means the set of states is
configuration, per project. Ours is a literal set in code
(`terminalStates`, and the `state` checks throughout the store), so adding a
state is a code change and states cannot differ per workspace.

**Take:** worth adopting only when a second workspace actually needs different
states. Recording it so the eventual change is a known one rather than a
surprise; not a current gap.

## 4. Ordering is explicit — teams

`rank: Rank` (LexoRank-style) rather than sorting by creation time. Ours sorts
`createdAt` descending in `list()`, so a queue cannot be reordered without
rewriting timestamps.

**Take:** `priority` is the cheaper 80% (see §5) and is what multica uses. Full
rank ordering only matters once a human drags items in a UI.

## 5. Every agent task attaches to an issue — multica

`server/migrations/003_task_context.up.sql` and the queue definition:

```sql
CREATE TABLE agent_task_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id UUID NOT NULL REFERENCES agent(id) ON DELETE CASCADE,
    issue_id UUID NOT NULL REFERENCES issue(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'queued'
        CHECK (status IN ('queued','dispatched','running','completed','failed','cancelled')),
    priority INT NOT NULL DEFAULT 0,
    dispatched_at TIMESTAMPTZ,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    result JSONB,
    error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

`issue_id` is `NOT NULL`. **Agent work cannot exist without a reason for
existing.** That single constraint is the mechanism connecting "what needs to be
done" to "what is going on" — and it is exactly the link this repository's own
contract demands of humans (every change traces to an owning issue) while its
agent tasks are exempt.

**Take: the highest-value pattern here.** An optional `issueRef` on the task
record, populated by the supervisor when work traces to a GitHub issue, turns
the task list into a live view of issue progress. Optional rather than
`NOT NULL`, because exploratory work legitimately has no issue yet.

## 6. Lifecycle timestamps, and error separate from result — multica

`dispatched_at`, `started_at`, `completed_at` as distinct columns, and `error`
as a column separate from `result`.

Ours collapses failure into `result.summary` with a `verification.state` of
`failed`, so a reader must inspect the result to learn whether it is a result at
all. And with only `createdAt`, no duration is computable — we cannot answer
"how long do research tasks take" or "is this one stuck".

**Take:** both. Timestamps are additive and unlock the first real measurement of
the agent loop. Separating error from result makes failure legible without
parsing.

## 7. Denormalised activity counts — teams

`comments?: number`, `attachments?: number`, `labels?: number` on the task
itself, so a list view never fans out.

**Take:** not yet. We have no comment or attachment model on tasks. Recorded so
that if one is added, the count lands on the record at the same time rather than
becoming an N+1 later.

## 8. Implementation order

Ranked by value per unit of change, smallest first:

1. **Lifecycle timestamps** — `dispatchedAt`, `startedAt`, `completedAt`.
   Additive, no behaviour change, makes the loop measurable.
2. **`issueRef`** — optional link from task to owning issue. Connects agent work
   to the issue-driven workflow the contract already requires.
3. **Human-readable `identifier`** — per-workspace counter. Lets the supervisor
   name tasks in conversation.
4. **`error` separate from `result`** — a small migration of existing records.
5. Status-as-data, rank ordering, activity counts — deferred, with the trigger
   for each recorded above.

None of these require a database. All are fields on the existing JSON record,
which is what makes them worth doing now rather than after a storage migration.

## 9. Sources

Read from working checkouts under `project-packages-git/reference/`, 2026-08-29.

- `teams/plugins/task/src/index.ts` — `Task`, `KanbanCard`, `ProjectStatus`
- `teams/models/task/`, `teams/plugins/board/`
- `multica/server/migrations/003_task_context.up.sql`,
  `004_agent_runtime_loop.up.sql`
- `multica/server/internal/` — `dispatch`, `entitlement`, `issuestatus`,
  `issueguard`, `metrics`
