import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, it } from 'node:test'
import { FileOrchestrationStore } from '../src/orchestration-store.mjs'

// The main agent dispatches work and must be able to fold the result back into
// the conversation. Before collect_specialist_results, submission returned only
// a receipt and everything the specialist produced was written to the store and
// never returned to the conversation that asked for it.
//
// These cover the collection semantics the tool depends on. The tool itself is a
// thin read over exactly these store calls.

const TERMINAL_STATES = new Set(['succeeded', 'failed', 'cancelled', 'expired'])
const directories = []
afterEach(() => { for (const directory of directories.splice(0)) fs.rmSync(directory, { recursive: true, force: true }) })

function fixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'bapx-collect-'))
  directories.push(directory)
  return new FileOrchestrationStore({ directory })
}

const alpha = { account: 'alpha-user', workspaceScope: 'users/alpha-user/acme' }
const beta = { account: 'beta-user', workspaceScope: 'users/beta-user/acme' }
const submission = { sessionId: 'conversation-1', profile: 'research', objective: 'Gather bounded evidence.' }

// Mirrors what the tool does, so the semantics are asserted rather than assumed.
function collect(store, scope) {
  const completed = []
  const pending = []
  for (const task of store.list(scope)) {
    if (!TERMINAL_STATES.has(task.state)) { pending.push(task); continue }
    if (task.notification === 'acknowledged') continue
    completed.push(task)
    try { store.acknowledge(scope, task.id, task.version) } catch { /* another reader won */ }
  }
  return { completed, pending }
}

function finish(store, scope, task, summary) {
  const claimed = store.claim(scope, task.id, task.version, 'worker-1')
  return store.complete(scope, task.id, claimed.version, {
    summary, evidence: ['file.ts:1'], artifacts: [], verification: { state: 'verified' }, contextUpdates: [],
  })
}

describe('collecting specialist results', () => {
  it('returns a completed task with its summary and evidence', () => {
    const store = fixture()
    const task = store.create(alpha, submission)
    finish(store, alpha, task, 'Found three sources.')

    const { completed, pending } = collect(store, alpha)
    assert.equal(completed.length, 1)
    assert.equal(pending.length, 0)
    assert.equal(completed[0].result.summary, 'Found three sources.')
    assert.deepEqual(completed[0].result.evidence, ['file.ts:1'])
  })

  // Without acknowledgement the agent would repeat the same finding every turn.
  it('does not return the same result twice', () => {
    const store = fixture()
    const task = store.create(alpha, submission)
    finish(store, alpha, task, 'Done once.')

    assert.equal(collect(store, alpha).completed.length, 1)
    assert.equal(collect(store, alpha).completed.length, 0, 'a collected result must not come back again')
  })

  it('reports running work as pending rather than as a result', () => {
    const store = fixture()
    store.create(alpha, submission)
    const { completed, pending } = collect(store, alpha)
    assert.equal(completed.length, 0)
    assert.equal(pending.length, 1, 'the agent must be able to say "still running"')
  })

  // An agent that cannot see a failed specialist will confidently report success.
  it('returns a failed task with its failure summary', () => {
    const store = fixture()
    const task = store.create(alpha, submission)
    const claimed = store.claim(alpha, task.id, task.version, 'worker-1')
    store.fail(alpha, task.id, claimed.version, { summary: 'Upstream refused.', evidence: [], retryable: true })

    const { completed } = collect(store, alpha)
    assert.equal(completed.length, 1)
    assert.equal(completed[0].state, 'failed')
    assert.equal(completed[0].result.summary, 'Upstream refused.')
    assert.notEqual(completed[0].state, 'succeeded', 'failure must be distinguishable from success')
  })

  it('never returns another account’s work', () => {
    const store = fixture()
    const task = store.create(alpha, submission)
    finish(store, alpha, task, 'Alpha only.')

    assert.equal(collect(store, beta).completed.length, 0, 'beta must not see alpha’s results')
    assert.equal(collect(store, alpha).completed.length, 1)
  })
})
