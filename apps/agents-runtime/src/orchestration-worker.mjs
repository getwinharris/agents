import crypto from 'node:crypto'
import { OrchestrationConflictError } from './orchestration-store.mjs'

/**
 * The dispatcher that makes a submitted task actually run.
 *
 * Before this, `submit_specialist_task` persisted a record and returned a
 * receipt, and nothing ever claimed it: `claim`, `publishProgress` and
 * `complete` had no caller outside the store's own tests. Tasks sat in
 * `queued` forever and the Tasks UI could never show progress.
 *
 * The loop is deliberately single-flight per tick. Specialist work is the
 * expensive part, and running one bounded task to completion with a live lease
 * is more useful than starting several that all lose their leases together.
 */
export function createOrchestrationWorker({
  store,
  execute,
  workerId = `worker-${crypto.randomUUID()}`,
  leaseMs = 30_000,
  heartbeatMs = 10_000,
  pollMs = 1_000,
  maxAttempts = 3,
  onError = () => {},
}) {
  if (typeof execute !== 'function') throw new TypeError('An execute function is required.')
  let running = false
  let timer = null
  let inFlight = null

  async function runClaimed(scope, claimed) {
    // The claim already bumped the version. Every later write has to carry the
    // version it actually follows, so track it as the task progresses.
    let current = claimed
    let done = false

    const heartbeat = setInterval(() => {
      if (done) return
      try {
        current = store.renewLease(scope, current.id, current.version, workerId, leaseMs)
      } catch (cause) {
        // Losing the lease means recovery already requeued this task and
        // another worker may hold it. Stop renewing and let the run finish or
        // fail on its own; the conflict guard on complete/fail is what keeps
        // two workers from both writing a result.
        onError(cause)
      }
    }, heartbeatMs)
    if (typeof heartbeat.unref === 'function') heartbeat.unref()

    try {
      const result = await execute({
        task: current,
        scope,
        publishProgress: (progress) => {
          if (done) return current
          try {
            current = store.publishProgress(scope, current.id, current.version, progress)
          } catch (cause) {
            onError(cause)
          }
          return current
        },
      })
      done = true
      clearInterval(heartbeat)
      return store.complete(scope, current.id, current.version, result ?? { summary: 'Completed with no reported result.' })
    } catch (cause) {
      done = true
      clearInterval(heartbeat)
      onError(cause)
      // Reload: the executor may have published progress, and a stale version
      // here would turn a real failure into an unrelated conflict.
      const latest = store.get(scope, current.id) ?? current
      if (latest.state !== 'running') return latest
      const retryable = cause?.retryable !== false && latest.attempt < maxAttempts
      if (retryable) {
        return store.requeue(scope, latest.id, latest.version, `Attempt ${latest.attempt} failed: ${message(cause)}`)
      }
      return store.fail(scope, latest.id, latest.version, {
        summary: `Failed after ${latest.attempt} attempt(s): ${message(cause)}`,
        evidence: [{ type: 'error', detail: message(cause) }],
        retryable: false,
      })
    }
  }

  async function runOnce() {
    // Recover first. A task whose worker died is `running` with a dead lease
    // and would never be picked up by the pending scan.
    let recovered = 0
    for (const ref of safely(() => store.expiredLeaseRefs(), onError) ?? []) {
      try {
        store.requeue(ref.scope, ref.id, ref.version, 'Lease expired; returned to the queue.')
        recovered += 1
      } catch (cause) {
        if (!(cause instanceof OrchestrationConflictError)) onError(cause)
      }
    }

    for (const ref of safely(() => store.pendingTaskRefs(), onError) ?? []) {
      let claimed
      try {
        claimed = store.claim(ref.scope, ref.id, ref.version, workerId, leaseMs)
      } catch (cause) {
        // Another worker won the race, or the task moved on. Try the next one.
        if (!(cause instanceof OrchestrationConflictError)) onError(cause)
        continue
      }
      if (!claimed) continue
      const task = await runClaimed(ref.scope, claimed)
      return { recovered, claimed: true, task }
    }
    return { recovered, claimed: false, task: null }
  }

  return {
    workerId,
    runOnce,
    get running() {
      return running
    },
    start() {
      if (running) return
      running = true
      const tick = async () => {
        if (!running) return
        inFlight = runOnce().catch(onError)
        await inFlight
        inFlight = null
        if (running) {
          timer = setTimeout(tick, pollMs)
          if (typeof timer.unref === 'function') timer.unref()
        }
      }
      void tick()
    },
    async stop() {
      running = false
      if (timer) clearTimeout(timer)
      timer = null
      if (inFlight) await inFlight
    },
  }
}

function message(cause) {
  return cause instanceof Error ? cause.message : String(cause)
}

function safely(read, onError) {
  try {
    return read()
  } catch (cause) {
    onError(cause)
    return null
  }
}
