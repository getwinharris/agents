import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, it } from 'node:test'
import { FileOrchestrationStore, OrchestrationAuthorizationError, OrchestrationConflictError } from '../src/orchestration-store.mjs'

const directories = []
afterEach(() => { for (const directory of directories.splice(0)) fs.rmSync(directory, { recursive: true, force: true }) })
function fixture(now = new Date('2026-07-29T12:00:00.000Z')) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'bapx-orchestration-'))
  directories.push(directory)
  return { directory, store: new FileOrchestrationStore({ directory, now: () => now }) }
}
const alpha = { account: 'alpha-user', workspaceScope: 'users/alpha-user/acme' }
const beta = { account: 'beta-user', workspaceScope: 'users/beta-user/acme' }
const submission = { sessionId: 'conversation-1', profile: 'research', objective: 'Gather bounded evidence.' }

describe('FileOrchestrationStore', () => {
  it('rejects an invalid approval decision instead of cancelling the task', () => {
    const { store } = fixture()
    const task = store.create(alpha, { ...submission, requiresApproval: true })
    for (const decision of [undefined, '', 'approvd', 'yes', 'APPROVED']) {
      assert.throws(() => store.approve(alpha, task.id, task.version, decision, 'owner'), TypeError)
    }
    // The task must still be approvable afterwards.
    const approved = store.approve(alpha, task.id, task.version, 'approved', 'owner')
    assert.equal(approved.state, 'queued')
    assert.equal(approved.approval.state, 'approved')
  })


  it('reclaims a lock abandoned by a dead process but never one still held', () => {
    // A lock removed only by the owning process's finally block survives a crash
    // or kill. Without reclamation every later update to that task conflicts
    // forever and needs an operator to clear the file by hand.
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'bapx-orchestration-'))
    directories.push(directory)
    let clock = new Date('2026-07-29T12:00:00.000Z')
    const store = new FileOrchestrationStore({ directory, now: () => clock })
    const task = store.create(alpha, submission)
    const lock = path.join(directory, `${task.id}.json.lock`)

    // A live holder must still conflict, however old the lock claims to be.
    fs.writeFileSync(lock, JSON.stringify({ pid: process.pid, at: new Date('2026-07-29T11:00:00.000Z').toISOString() }))
    assert.throws(() => store.transition(alpha, task.id, task.version, 'accepted'), OrchestrationConflictError)

    // A dead holder within the stale window must also still conflict.
    fs.writeFileSync(lock, JSON.stringify({ pid: 0x7ffffffe, at: clock.toISOString() }))
    assert.throws(() => store.transition(alpha, task.id, task.version, 'accepted'), OrchestrationConflictError)

    // Same dead holder, once the lock is demonstrably stale: reclaim it.
    clock = new Date('2026-07-29T12:05:00.000Z')
    const moved = store.transition(alpha, task.id, task.version, 'accepted')
    assert.equal(moved.state, 'accepted')
    assert.equal(fs.existsSync(lock), false)
  })


  it('isolates records by trusted account and workspace when tenants share one store', () => {
    const { store } = fixture()
    const task = store.create(alpha, submission)
    assert.throws(() => store.get(beta, task.id), OrchestrationAuthorizationError)
    assert.deepEqual(store.list(beta), [])
  })

  it('persists queued work and recovers an expired lease after restart', () => {
    let now = new Date('2026-07-29T12:00:00.000Z')
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'bapx-orchestration-'))
    directories.push(directory)
    const first = new FileOrchestrationStore({ directory, now: () => now })
    const task = first.create(alpha, submission)
    const running = first.claim(alpha, task.id, task.version, 'worker-1', 1_000)
    now = new Date('2026-07-29T12:00:02.000Z')
    const restarted = new FileOrchestrationStore({ directory, now: () => now })
    const [recovered] = restarted.recoverExpiredLeases(alpha)
    assert.equal(recovered.state, 'queued')
    assert.equal(recovered.attempt, 1)
    assert.equal(recovered.lease, null)
    assert.equal(restarted.get(alpha, task.id).version, running.version + 1)
  })

  it('rejects stale worker results and preserves verifiable result evidence', () => {
    const { store } = fixture()
    const task = store.create(alpha, submission)
    const running = store.claim(alpha, task.id, task.version, 'worker-1')
    assert.throws(() => store.complete(alpha, task.id, task.version, { summary: 'stale' }), OrchestrationConflictError)
    const completed = store.complete(alpha, task.id, running.version, {
      summary: 'Verified repository state.',
      evidence: [{ kind: 'test', ref: 'test/orchestration-store.test.mjs' }],
      verification: { state: 'verified', verifier: 'verification' },
    })
    assert.equal(completed.state, 'succeeded')
    assert.match(completed.result.integrity.digest, /^[a-f0-9]{64}$/)
    assert.deepEqual(completed.result.verification, { state: 'verified', verifier: 'verification' })
  })

  it('fails closed when another process owns the task update lock', () => {
    const { directory, store } = fixture()
    const task = store.create(alpha, submission)
    fs.writeFileSync(path.join(directory, `${task.id}.json.lock`), 'worker-1', { mode: 0o600 })
    assert.throws(() => store.claim(alpha, task.id, task.version, 'worker-2'), OrchestrationConflictError)
    assert.equal(store.get(alpha, task.id).state, 'queued')
  })

  it('requires an explicit approval decision before privileged queued work', () => {
    const { store } = fixture()
    const task = store.create(alpha, { ...submission, profile: 'engineering', requiresApproval: true })
    assert.equal(task.state, 'waiting_approval')
    const approved = store.approve(alpha, task.id, task.version, 'approved', 'workspace-owner')
    assert.equal(approved.state, 'queued')
    assert.equal(approved.approval.actor, 'workspace-owner')
  })

  it('prevents repeated completion narration through durable acknowledgement state', () => {
    const { store } = fixture()
    const task = store.create(alpha, submission)
    const running = store.claim(alpha, task.id, task.version, 'worker-1')
    const completed = store.complete(alpha, task.id, running.version, { summary: 'Done.' })
    const acknowledged = store.acknowledge(alpha, task.id, completed.version)
    assert.equal(acknowledged.notification, 'acknowledged')
    assert.throws(() => store.acknowledge(alpha, task.id, completed.version), OrchestrationConflictError)
  })
})
