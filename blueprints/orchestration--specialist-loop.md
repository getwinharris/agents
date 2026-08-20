---
{
  "kind": "orchestration",
  "version": 1
}
---

# Add the bapX Specialist Task Loop

You are an AI coding agent wiring durable background delegation into a bapX
runtime. Follow these instructions exactly.

## What this adds

A submitted specialist task is a *promise* until something runs it. This
blueprint installs the three pieces that keep that promise:

| Piece | File | Responsibility |
| --- | --- | --- |
| Store | `orchestration-store.mjs` | Durable tenant-scoped records, versions, leases, evidence integrity |
| Dispatcher | `orchestration-worker.mjs` | Claim, lease, heartbeat, retry, recover, complete |
| Executor | `specialist-executor.mjs` | What "running the task" actually means |

They are separate on purpose. The dispatcher's durability guarantees can be
tested without a model, and the execution strategy can change without
touching them.

## The failure this exists to remove

Without a dispatcher, `submit_specialist_task` persists a record, returns a
receipt, and the task stays `queued` forever. The submitting agent reports
success, the customer sees a task id, and no work happens. **Silent
non-execution is worse than a visible failure** — build the loop before you
expose the submit tool.

## Wiring

```js
import { createOrchestrationWorker } from './orchestration-worker.mjs'
import { createRuntimeSpecialistRunner, createSpecialistExecutor } from './specialist-executor.mjs'

export const worker = createOrchestrationWorker({
  store: new FileOrchestrationStore({ directory: process.env.BAPX_ORCHESTRATION_DIR }),
  execute: createSpecialistExecutor({
    runSpecialist: createRuntimeSpecialistRunner({ dispatch, getRun, agent: mainAgent }),
  }),
  onError: (cause) => console.error('[bapX] orchestration worker:', cause),
})
worker.start()
```

Start it from the bapX server entry. `dispatch()` throws outside one.

## Rules this loop must keep

1. **Never cross a tenant boundary.** The dispatcher is the one component that
   reads across tenants, and it only reads enough to claim — id, version,
   profile, scope. Every subsequent call goes back through the normal
   scope-checked methods so the authorization boundary still does the work.
2. **A lease must be renewed, not assumed.** Work outliving one lease period
   is normal. Heartbeat while running or recovery will re-run live work.
3. **A crashed worker must not wedge a task.** Locks carry a staleness window
   and expired leases return to the queue.
4. **Never record unverified work as verified.** A specialist claiming success
   with no evidence is recorded `unverified`. The workspace contract is that
   delegated work is not complete until evidence is independently verified.
5. **A permanent misconfiguration must not burn retries.** Mark it
   `retryable: false` and fail with an actionable cause.
6. **Approval gates execution.** A task in `waiting_approval` is never
   claimable. Derive the approving actor from the authenticated scope, never
   from the request body.

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `BAPX_ORCHESTRATION_DIR` | `.agents/orchestration/tasks` | Durable task records. Must be a mounted volume. |
| `BAPX_ORCHESTRATION_POLL_MS` | `1000` | Idle poll interval |
| `BAPX_ORCHESTRATION_WORKER` | unset | Set to `off` to run an API-only replica |

`BAPX_ORCHESTRATION_DIR` on an ephemeral container layer loses every in-flight
task on restart. Mount it.

## Running more than one replica

The store is single-node: it coordinates through the filesystem, so replicas
must share the volume. Claims are version-guarded, so a lost race is a
conflict rather than a double-run. For replicas that do not share storage, set
`BAPX_ORCHESTRATION_WORKER=off` on all but one.

## Verify

```bash
npm run test --workspace bapX-agents-runtime
```

The suite must prove a submitted task reaches `succeeded`, that a dead
worker's task is recovered, and that one tenant cannot read another's task.
