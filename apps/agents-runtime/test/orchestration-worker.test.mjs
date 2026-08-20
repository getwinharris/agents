import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { FileOrchestrationStore } from '../src/orchestration-store.mjs'
import { createOrchestrationWorker } from '../src/orchestration-worker.mjs'

const scope = { account: 'acme', workspaceScope: 'users/acme/main' }
const other = { account: 'globex', workspaceScope: 'users/globex/main' }

function freshStore(t, options = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'bapx-orch-'))
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }))
  return new FileOrchestrationStore({ directory, ...options })
}
function submit(store, taskScope = scope, input = {}) {
  return store.create(taskScope, { sessionId: 's1', profile: 'research', objective: 'Find the thing', ...input })
}

test('a submitted task actually runs and reaches succeeded', async (t) => {
  // This is the whole point. Before the dispatcher existed a submitted task
  // stayed queued forever, because nothing called claim/complete.
  const store = freshStore(t)
  const task = submit(store)
  assert.equal(task.state, 'queued')

  const worker = createOrchestrationWorker({
    store,
    execute: async ({ task: claimed, publishProgress }) => {
      assert.equal(claimed.state, 'running')
      assert.equal(claimed.objective, 'Find the thing')
      publishProgress({ summary: 'Halfway', percent: 50 })
      return { summary: 'Found it', evidence: [{ type: 'source', detail: 'docs/x.md' }] }
    },
  })
  const outcome = await worker.runOnce()
  assert.equal(outcome.claimed, true)

  const final = store.get(scope, task.id)
  assert.equal(final.state, 'succeeded')
  assert.equal(final.result.summary, 'Found it')
  assert.equal(final.progress.summary, 'Halfway')
  assert.equal(final.attempt, 1)
  assert.equal(final.lease, null)
  // Evidence must be integrity-sealed, not just stored.
  assert.equal(final.result.integrity.algorithm, 'sha256')
  assert.ok(final.events.some((event) => event.type === 'claimed'))
  assert.ok(final.events.some((event) => event.type === 'completed'))
})

test('a failing task retries, then fails with its cause recorded', async (t) => {
  const store = freshStore(t)
  const task = submit(store)
  let attempts = 0
  const worker = createOrchestrationWorker({
    store,
    maxAttempts: 2,
    execute: async () => {
      attempts += 1
      throw new Error('provider unavailable')
    },
  })

  await worker.runOnce()
  assert.equal(store.get(scope, task.id).state, 'queued', 'first failure returns it to the queue')
  await worker.runOnce()

  const final = store.get(scope, task.id)
  assert.equal(attempts, 2)
  assert.equal(final.state, 'failed')
  assert.match(final.result.summary, /provider unavailable/)
  assert.equal(final.result.retryable, false)
})

test('the worker never crosses a tenant boundary', async (t) => {
  const store = freshStore(t)
  const globexTask = submit(store, other, { objective: 'Globex private work' })
  const seen = []
  const worker = createOrchestrationWorker({
    store,
    execute: async ({ task: claimed, scope: claimedScope }) => {
      seen.push({ objective: claimed.objective, account: claimedScope.account })
      return { summary: 'done' }
    },
  })
  await worker.runOnce()

  assert.equal(seen.length, 1)
  assert.equal(seen[0].account, 'globex')
  assert.equal(store.get(other, globexTask.id).state, 'succeeded')
  // The acme tenant must still not be able to read the globex task through the
  // normal scoped API, even though the shared dispatcher just ran it.
  assert.throws(
    () => store.get(scope, globexTask.id),
    (error) => error.constructor.name === 'OrchestrationAuthorizationError',
  )
  assert.deepEqual(store.list(scope), [])
})

test('a task abandoned by a dead worker is recovered and completed', async (t) => {
  const store = freshStore(t)
  const task = submit(store)
  // Simulate a worker that claimed the task and then died: running, lease long
  // expired, nothing will ever finish it.
  const claimed = store.claim(scope, task.id, task.version, 'dead-worker', -1)
  assert.equal(claimed.state, 'running')

  const worker = createOrchestrationWorker({
    store,
    execute: async () => ({ summary: 'picked up after recovery' }),
  })
  const outcome = await worker.runOnce()

  // One tick both recovers the abandoned lease and picks the task back up.
  assert.equal(outcome.recovered, 1)
  assert.equal(outcome.claimed, true)
  const final = store.get(scope, task.id)
  assert.equal(final.state, 'succeeded')
  assert.equal(final.result.summary, 'picked up after recovery')
  assert.equal(final.attempt, 2, 'the dead attempt still counts')
  assert.ok(final.events.some((event) => event.type === 'requeued'))
})

test('a task awaiting approval is not run until it is approved', async (t) => {
  const store = freshStore(t)
  const task = submit(store, scope, { requiresApproval: true })
  assert.equal(task.state, 'waiting_approval')

  let ran = false
  const worker = createOrchestrationWorker({ store, execute: async () => { ran = true; return { summary: 'x' } } })
  const idle = await worker.runOnce()
  assert.equal(idle.claimed, false)
  assert.equal(ran, false, 'unapproved work must never execute')

  store.approve(scope, task.id, task.version, 'approved', 'owner')
  await worker.runOnce()
  assert.equal(ran, true)
  assert.equal(store.get(scope, task.id).state, 'succeeded')
})

test('a lock left by a killed process does not wedge the task forever', async (t) => {
  const store = freshStore(t, { lockStaleMs: 50 })
  const task = submit(store)
  // Exactly what a SIGKILL mid-update leaves behind.
  fs.writeFileSync(`${path.join(store.directory, `${task.id}.json`)}.lock`, '')
  assert.throws(() => store.transition(scope, task.id, task.version, 'cancelled'))

  await new Promise((resolve) => setTimeout(resolve, 60))
  const worker = createOrchestrationWorker({ store, execute: async () => ({ summary: 'ran anyway' }) })
  await worker.runOnce()
  assert.equal(store.get(scope, task.id).state, 'succeeded')
})

test('the polling loop drains a queue and stops cleanly', async (t) => {
  const store = freshStore(t)
  const ids = [submit(store).id, submit(store).id, submit(store).id]
  const worker = createOrchestrationWorker({ store, pollMs: 1, execute: async () => ({ summary: 'ok' }) })

  worker.start()
  const deadline = Date.now() + 5_000
  while (Date.now() < deadline) {
    if (ids.every((id) => store.get(scope, id).state === 'succeeded')) break
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  await worker.stop()

  for (const id of ids) assert.equal(store.get(scope, id).state, 'succeeded')
  assert.equal(worker.running, false)
})

test('the long-running lease is renewed instead of expiring under the worker', async (t) => {
  const store = freshStore(t)
  const task = submit(store)
  const worker = createOrchestrationWorker({
    store,
    leaseMs: 120,
    heartbeatMs: 20,
    execute: async () => {
      await new Promise((resolve) => setTimeout(resolve, 300))
      return { summary: 'slow but alive' }
    },
  })
  await worker.runOnce()

  const final = store.get(scope, task.id)
  assert.equal(final.state, 'succeeded', 'a task outliving one lease period must not be killed')
  assert.equal(final.attempt, 1, 'it must not have been recovered and re-run')
  assert.ok(final.events.some((event) => event.type === 'lease:renewed'))
})
