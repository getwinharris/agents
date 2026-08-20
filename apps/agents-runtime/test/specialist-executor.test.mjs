import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { FileOrchestrationStore } from '../src/orchestration-store.mjs'
import { createOrchestrationWorker } from '../src/orchestration-worker.mjs'
import { createSpecialistExecutor, createRuntimeSpecialistRunner } from '../src/specialist-executor.mjs'

const scope = { account: 'acme', workspaceScope: 'users/acme/main' }

function freshStore(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'bapx-exec-'))
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }))
  return new FileOrchestrationStore({ directory })
}

test('the specialist runs with only its profile permissions', async (t) => {
  const store = freshStore(t)
  const task = store.create(scope, { sessionId: 's', profile: 'research', objective: 'Check the docs' })
  let handed
  const worker = createOrchestrationWorker({
    store,
    execute: createSpecialistExecutor({
      runSpecialist: async (input) => {
        handed = input
        return { summary: 'Read three pages', evidence: [{ type: 'source', detail: 'docs/a.md' }] }
      },
    }),
  })
  await worker.runOnce()

  // research is read-only: it must never be handed a write permission.
  assert.deepEqual(handed.permissions, ['workspace:read', 'web:read'])
  assert.equal(handed.objective, 'Check the docs')
  assert.equal(handed.scope.workspaceScope, 'users/acme/main')
  assert.equal(store.get(scope, task.id).state, 'succeeded')
})

test('evidence-free work is recorded as unverified, never as verified', async (t) => {
  const store = freshStore(t)
  const task = store.create(scope, { sessionId: 's', profile: 'research', objective: 'Guess' })
  const worker = createOrchestrationWorker({
    store,
    execute: createSpecialistExecutor({
      // A specialist claiming success with no evidence must not be believed.
      runSpecialist: async () => ({ summary: 'Trust me', verification: { state: 'verified' } }),
    }),
  })
  await worker.runOnce()

  const final = store.get(scope, task.id)
  assert.equal(final.state, 'succeeded')
  assert.equal(final.result.verification.state, 'unverified')
  assert.match(final.result.verification.reason, /no evidence/i)
})

test('an empty summary fails the task instead of recording a hollow success', async (t) => {
  const store = freshStore(t)
  const task = store.create(scope, { sessionId: 's', profile: 'research', objective: 'x' })
  const worker = createOrchestrationWorker({
    store,
    maxAttempts: 1,
    execute: createSpecialistExecutor({ runSpecialist: async () => ({ summary: '   ' }) }),
  })
  await worker.runOnce()

  const final = store.get(scope, task.id)
  assert.equal(final.state, 'failed')
  assert.match(final.result.summary, /no summary/i)
})

test('an unconfigured runtime fails the task with an actionable cause', async (t) => {
  // The failure mode this whole change exists to remove: work that silently
  // never runs. If the runtime is missing, say so in the task result.
  const store = freshStore(t)
  const task = store.create(scope, { sessionId: 's', profile: 'engineering', objective: 'Build' })
  const worker = createOrchestrationWorker({
    store,
    execute: createSpecialistExecutor({
      runSpecialist: createRuntimeSpecialistRunner({ dispatch: undefined, getRun: undefined, agent: {} }),
    }),
  })
  await worker.runOnce()

  const final = store.get(scope, task.id)
  assert.equal(final.state, 'failed')
  assert.match(final.result.summary, /runtime is not configured/i)
  assert.equal(final.attempt, 1, 'a permanent misconfiguration must not burn retries')
})

test('the runtime runner polls a dispatched run to completion', async (t) => {
  const store = freshStore(t)
  const task = store.create(scope, { sessionId: 's', profile: 'engineering', objective: 'Ship' })
  let polls = 0
  const worker = createOrchestrationWorker({
    store,
    execute: createSpecialistExecutor({
      runSpecialist: createRuntimeSpecialistRunner({
        agent: {},
        pollMs: 1,
        dispatch: async () => ({ runId: 'run-1' }),
        getRun: async (runId) => {
          assert.equal(runId, 'run-1')
          polls += 1
          return polls < 3
            ? { status: 'running' }
            : { status: 'succeeded', result: { summary: 'Shipped', evidence: [{ type: 'commit', detail: 'abc123' }] } }
        },
      }),
    }),
  })
  await worker.runOnce()

  const final = store.get(scope, task.id)
  assert.equal(final.state, 'succeeded')
  assert.equal(final.result.summary, 'Shipped')
  assert.ok(polls >= 3)
})

test('a failed specialist run surfaces the runtime error', async (t) => {
  const store = freshStore(t)
  const task = store.create(scope, { sessionId: 's', profile: 'verification', objective: 'Verify' })
  const worker = createOrchestrationWorker({
    store,
    maxAttempts: 1,
    execute: createSpecialistExecutor({
      runSpecialist: createRuntimeSpecialistRunner({
        agent: {},
        pollMs: 1,
        dispatch: async () => ({ runId: 'run-2' }),
        getRun: async () => ({ status: 'failed', error: 'model provider rejected the request' }),
      }),
    }),
  })
  await worker.runOnce()

  assert.match(store.get(scope, task.id).result.summary, /model provider rejected/)
})
