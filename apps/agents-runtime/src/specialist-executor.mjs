import { specialistProfiles } from './orchestration-store.mjs'

/**
 * Turns a claimed task into real specialist work.
 *
 * The dispatcher owns claiming, leasing, retry and recovery; this owns "what
 * running the task means". They are separate so the loop can be tested without
 * a model, and so the execution strategy can change without touching the
 * durability guarantees.
 *
 * `runSpecialist` is injected rather than imported so this module stays
 * testable and so the runtime binding lives in one place (app.ts).
 */
export function createSpecialistExecutor({ runSpecialist, timeoutMs = 10 * 60_000 }) {
  if (typeof runSpecialist !== 'function') throw new TypeError('runSpecialist is required.')

  return async function execute({ task, scope, publishProgress }) {
    const profile = specialistProfiles[task.profile]
    if (!profile) {
      // Not retryable: a bad profile will never become good on a second pass.
      throw Object.assign(new Error(`Unknown specialist profile "${task.profile}".`), { retryable: false })
    }

    publishProgress({ summary: `Starting ${task.profile} specialist.`, percent: 0 })

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), timeoutMs)
    if (typeof timeout.unref === 'function') timeout.unref()

    let outcome
    try {
      outcome = await runSpecialist({
        profile: task.profile,
        permissions: profile.permissions,
        objective: task.objective,
        context: task.context,
        completionCriteria: task.completionCriteria,
        scope,
        signal: controller.signal,
        onProgress: (summary, percent) => publishProgress({ summary, percent }),
      })
    } finally {
      clearTimeout(timeout)
    }

    if (!outcome || typeof outcome.summary !== 'string' || !outcome.summary.trim()) {
      throw new Error('The specialist returned no summary; refusing to record an empty result.')
    }

    const evidence = Array.isArray(outcome.evidence) ? outcome.evidence : []
    // The workspace contract is explicit that delegated work is not complete
    // until its evidence is independently verified. Record what is actually
    // true rather than defaulting to "verified".
    const verification = evidence.length === 0
      ? { state: 'unverified', reason: 'The specialist returned no evidence.' }
      : (outcome.verification ?? { state: 'unverified', reason: 'No independent verification was run.' })

    return {
      summary: outcome.summary.trim(),
      evidence,
      artifacts: Array.isArray(outcome.artifacts) ? outcome.artifacts : [],
      verification,
      contextUpdates: Array.isArray(outcome.contextUpdates) ? outcome.contextUpdates : [],
    }
  }
}

/**
 * The default binding: run the named specialist through the agent runtime.
 * Kept separate so a deployment without provider credentials fails a task with
 * an actionable message instead of hanging in `queued` -- which is exactly the
 * silent failure this whole change exists to remove.
 */
export function createRuntimeSpecialistRunner({ dispatch, getRun, agent, pollMs = 500, now = () => Date.now() }) {
  return async function runSpecialist({ profile, objective, completionCriteria, scope, signal, onProgress }) {
    if (typeof dispatch !== 'function' || typeof getRun !== 'function') {
      throw Object.assign(
        new Error('The agent runtime is not configured, so specialist work cannot run. Start the worker from the bapX server entry.'),
        { retryable: false },
      )
    }
    const receipt = await dispatch(agent, {
      input: {
        profile,
        objective,
        completionCriteria: completionCriteria ?? [],
        workspaceScope: scope.workspaceScope,
      },
    })
    onProgress(`Dispatched to the ${profile} specialist.`, 10)

    for (;;) {
      if (signal?.aborted) throw new Error('The specialist exceeded its time budget.')
      const run = await getRun(receipt.runId)
      if (run?.status === 'succeeded') return run.result ?? { summary: 'The specialist reported no result.' }
      if (run?.status === 'failed') throw new Error(run.error ?? 'The specialist run failed.')
      await sleep(pollMs, signal)
      void now
    }
  }
}

function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    // Deliberately not unref'd. This is an active wait inside a task the
    // worker is holding a lease on -- unref'ing it lets the process consider
    // itself idle and stall the poll mid-run.
    const timer = setTimeout(resolve, ms)
    signal?.addEventListener('abort', () => { clearTimeout(timer); reject(new Error('The specialist exceeded its time budget.')) }, { once: true })
  })
}
