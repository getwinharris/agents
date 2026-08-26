---
type: "Internal Doc"
title: "Orchestration loop — host mechanics"
description: "Customer-facing behavior is apps/www/src/content/docs/guide/delegated-tasks.md."
---
# Orchestration loop — host mechanics

Customer-facing behavior is `apps/www/src/content/docs/guide/delegated-tasks.md`.
This is the part customers must not need to know.

## Why this exists

`submit_specialist_task` shipped without a dispatcher. `claim()`,
`publishProgress()` and `complete()` had no caller anywhere outside the
store's own tests. Every submitted task stayed `queued` forever while the
agent reported a successful hand-off and the Tasks UI showed nothing.

That is the worst available failure mode: the product reports success and does
nothing. The loop closes it.

## Layout

| File | Responsibility |
| --- | --- |
| `orchestration-store.mjs` | Durable records, version guards, leases, locks, evidence integrity |
| `orchestration-worker.mjs` | Claim, heartbeat, retry, recover, complete |
| `specialist-executor.mjs` | What running a task means; runtime binding |
| `app.ts` | Scoped HTTP surface, worker start/stop |

## Deployment

`BAPX_ORCHESTRATION_DIR` **must be a mounted volume**. The compose file maps
`/data/tasks`. On the container's writable layer every in-flight task is lost
on recreate, which reintroduces silent non-execution by a different route.

Graceful shutdown: `SIGTERM`/`SIGINT` stop the poll and await the in-flight
task. A task killed mid-run is not lost — its lease expires and the next tick
requeues it — but a clean stop avoids the wait.

## Replicas

The store coordinates through the filesystem. Replicas must share the volume.
Claims are version-guarded, so a lost race is a 409, not a double-run. For
replicas that cannot share storage, set `BAPX_ORCHESTRATION_WORKER=off` on all
but one — otherwise each replica runs the whole queue independently.

## Locks

`update()` takes an exclusive `.lock` beside the record. A worker killed
between `openSync` and the `finally` used to leave that lock forever, and
every later operation on that task returned 409 with no recovery path. Locks
now carry a staleness window (`lockStaleMs`, default 60s) after which they are
reclaimed.

The window must stay comfortably longer than the slowest legitimate update.
Every update here is a read-modify-write of one small JSON file, so 60s is
several orders of magnitude of headroom. Do not lower it to speed up recovery
— lease expiry is the mechanism for that.

## Leases vs. locks

Two different things, easily confused:

- A **lock** is held for the microseconds of a single record update.
- A **lease** is held for as long as a worker is running a task, and is
  renewed by a heartbeat every `heartbeatMs`.

Lease expiry is what makes a dead worker's task recoverable. Lock staleness is
what makes a dead worker's *record* writable again.

## What is not done

- **No model-backed specialist runner is wired.** Production uses
  `createUnconfiguredSpecialistRunner()`: a task is accepted, is durable, and
  then fails immediately with a cause an operator can act on.

  This is deliberate, and the reason matters. `dispatch()` is fire-and-forget
  for agents, and its `DispatchReceipt.dispatchId` is explicitly documented as
  *not* a workflow `runId`, so `getRun(dispatchId)` never resolves. A runner
  built on that pairing would claim the task, report "Dispatched to the
  specialist", and then poll until the timeout — recreating silent
  non-execution with extra steps. The type checker caught this before it
  shipped; it is why `resolveRunId` is a required argument with no default.

  `createPollingSpecialistRunner` is ready for the case where a dispatch does
  map to a followable run (workflows do). Wiring a real specialist needs that
  mapping plus a provider credential (`BAPX_CREDENTIAL_ENCRYPTION_KEY` and a
  connected provider), which production does not have yet.
- **No cross-node coordination.** Single volume, single writer per task.
- **No priority or fairness.** Strictly oldest-first across all tenants, so one
  tenant submitting heavily delays others. Fine at current volume; revisit
  before it is not.
