import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

export const specialistProfiles = Object.freeze({
  research: Object.freeze({ permissions: ['workspace:read', 'web:read'] }),
  engineering: Object.freeze({ permissions: ['workspace:read', 'workspace:write', 'shell:project'] }),
  verification: Object.freeze({ permissions: ['workspace:read', 'shell:test'] }),
})

const terminalStates = new Set(['succeeded', 'failed', 'cancelled', 'expired'])
const transitions = Object.freeze({
  queued: ['accepted', 'cancelled', 'expired'],
  accepted: ['running', 'cancelled', 'expired'],
  running: ['waiting_approval', 'succeeded', 'failed', 'cancelled', 'expired'],
  waiting_approval: ['queued', 'cancelled', 'expired'],
  succeeded: [], failed: [], cancelled: [], expired: [],
})

function clone(value) { return structuredClone(value) }
function digest(value) { return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex') }
function assertScope(scope) {
  if (!scope || typeof scope !== 'object' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(scope.account) ||
      !new RegExp(`^users/${scope.account}/[a-z0-9]+(?:-[a-z0-9]+)*$`).test(scope.workspaceScope)) {
    throw new TypeError('A canonical account and business workspace scope are required.')
  }
}
function scoped(task, scope) { return task.account === scope.account && task.workspaceScope === scope.workspaceScope }

function processAlive(pid) {
  try {
    // Signal 0 performs the permission and existence check without delivering.
    process.kill(pid, 0)
    return true
  } catch (error) {
    return error.code === 'EPERM'
  }
}

export class OrchestrationConflictError extends Error {}
export class OrchestrationAuthorizationError extends Error {}

export class FileOrchestrationStore {
  constructor({ directory, now = () => new Date(), lockStaleMs = 60_000 }) {
    this.directory = directory
    this.now = now
    this.lockStaleMs = lockStaleMs
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 })
  }
  file(taskId) { return path.join(this.directory, `${taskId}.json`) }
  write(record) {
    const file = this.file(record.id)
    const temporary = `${file}.${process.pid}.${crypto.randomUUID()}.tmp`
    fs.writeFileSync(temporary, `${JSON.stringify(record, null, 2)}\n`, { mode: 0o600 })
    fs.renameSync(temporary, file)
    return clone(record)
  }
  readRaw(taskId) {
    try { return JSON.parse(fs.readFileSync(this.file(taskId), 'utf8')) }
    catch (error) { if (error.code === 'ENOENT') return null; throw error }
  }
  create(scope, input) {
    assertScope(scope)
    if (!specialistProfiles[input.profile]) throw new TypeError('Unknown specialist profile.')
    if (!input.objective?.trim() || !input.sessionId?.trim()) throw new TypeError('objective and sessionId are required.')
    const now = this.now().toISOString()
    const record = {
      schemaVersion: 1, id: crypto.randomUUID(), version: 1, account: scope.account,
      workspaceScope: scope.workspaceScope, sessionId: input.sessionId, parentTaskId: input.parentTaskId ?? null,
      profile: input.profile, objective: input.objective.trim(), context: input.context ?? {},
      permissions: specialistProfiles[input.profile].permissions, completionCriteria: input.completionCriteria ?? [],
      state: input.requiresApproval ? 'waiting_approval' : 'queued', approval: input.requiresApproval ? { state: 'pending' } : { state: 'not_required' },
      attempt: 0, lease: null, progress: null, result: null, notification: 'pending',
      createdAt: now, updatedAt: now, deadlineAt: input.deadlineAt ?? null,
      events: [{ id: crypto.randomUUID(), type: 'submitted', at: now, version: 1 }],
    }
    return this.write(record)
  }
  get(scope, taskId) {
    assertScope(scope)
    const record = this.readRaw(taskId)
    if (!record) return null
    if (!scoped(record, scope)) throw new OrchestrationAuthorizationError('Task is outside the authorized workspace scope.')
    return clone(record)
  }
  list(scope) {
    assertScope(scope)
    return fs.readdirSync(this.directory).filter((name) => name.endsWith('.json')).map((name) => this.readRaw(name.slice(0, -5)))
      .filter((record) => record && scoped(record, scope)).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(clone)
  }
  // A lock file only ever removed by this process's finally block survives a
  // crash or a kill. Every later approval, cancellation, claim, progress update,
  // completion, or lease recovery for that task then conflicts forever, which
  // defeats the durable store's whole point and needs an operator to clear by
  // hand. Record ownership and age, and reclaim a demonstrably stale lock.
  acquireLock(lock) {
    try {
      return fs.openSync(lock, 'wx', 0o600)
    } catch (error) {
      if (error.code !== 'EEXIST') throw error
    }
    let held
    try { held = JSON.parse(fs.readFileSync(lock, 'utf8')) }
    catch { held = null }
    // A crash between creating the lock and writing its metadata leaves an empty
    // or partial file. Treating that as "unknown age" wedged the task forever,
    // which is the exact failure this reclaim exists to prevent. Fall back to the
    // file's own mtime, which is always present.
    let age
    if (held?.at) {
      age = this.now().getTime() - Date.parse(held.at)
    } else {
      try { age = this.now().getTime() - fs.statSync(lock).mtimeMs }
      catch (error) { if (error.code === 'ENOENT') return this.acquireLock(lock); throw error }
    }
    const ownerAlive = Number.isInteger(held?.pid) && (held.pid === process.pid || processAlive(held.pid))
    // Reclaim only when the holder is gone AND the lock is past the configured
    // stale window. A live holder must still conflict, however old the lock is.
    if (ownerAlive || !(age >= this.lockStaleMs)) {
      throw new OrchestrationConflictError('Task is being updated; reload before retrying.')
    }
    fs.rmSync(lock, { force: true })
    try {
      return fs.openSync(lock, 'wx', 0o600)
    } catch (error) {
      if (error.code === 'EEXIST') throw new OrchestrationConflictError('Task is being updated; reload before retrying.')
      throw error
    }
  }
  /**
   * System-only. Every other read refuses to cross a tenant boundary, which is
   * correct for request handlers but leaves the dispatcher unable to find work.
   * This returns just enough to claim a task -- never objective, context, or
   * result -- and each returned scope is fed straight back into the normal
   * scope-checked methods, so the authorization boundary still does the work.
   */
  pendingTaskRefs() {
    const refs = []
    for (const name of fs.readdirSync(this.directory)) {
      if (!name.endsWith('.json')) continue
      let record
      try { record = this.readRaw(name.slice(0, -5)) }
      catch { continue }
      if (!record || record.state !== 'queued') continue
      refs.push({
        id: record.id,
        version: record.version,
        profile: record.profile,
        attempt: record.attempt,
        createdAt: record.createdAt,
        scope: { account: record.account, workspaceScope: record.workspaceScope },
      })
    }
    return refs.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  }
  /** System-only. Expired leases across every tenant, for the recovery pass. */
  expiredLeaseRefs() {
    const now = this.now().getTime()
    const refs = []
    for (const name of fs.readdirSync(this.directory)) {
      if (!name.endsWith('.json')) continue
      let record
      try { record = this.readRaw(name.slice(0, -5)) }
      catch { continue }
      if (!record || record.state !== 'running') continue
      if (Date.parse(record.lease?.expiresAt ?? '') > now) continue
      refs.push({ id: record.id, version: record.version, scope: { account: record.account, workspaceScope: record.workspaceScope } })
    }
    return refs
  }
  renewLease(scope, taskId, expectedVersion, workerId, leaseMs) {
    return this.update(scope, taskId, expectedVersion, (record) => {
      if (record.state !== 'running') throw new OrchestrationConflictError('Only running tasks hold a lease.')
      if (record.lease?.workerId !== workerId) throw new OrchestrationConflictError('Lease is held by another worker.')
      record.lease = { workerId, expiresAt: new Date(this.now().getTime() + leaseMs).toISOString() }
      return record
    }, 'lease:renewed')
  }
  fail(scope, taskId, expectedVersion, failure) {
    return this.update(scope, taskId, expectedVersion, (record) => {
      if (record.state !== 'running') throw new OrchestrationConflictError('Only running tasks can fail.')
      record.state = 'failed'
      record.lease = null
      record.result = { summary: failure.summary, evidence: failure.evidence ?? [], artifacts: [], verification: { state: 'failed' }, contextUpdates: [], retryable: Boolean(failure.retryable) }
      return record
    }, 'failed')
  }
  requeue(scope, taskId, expectedVersion, reason) {
    return this.update(scope, taskId, expectedVersion, (record) => {
      if (record.state !== 'running') throw new OrchestrationConflictError('Only running tasks can be requeued.')
      record.state = 'queued'
      record.lease = null
      record.progress = { summary: reason, percent: null, at: this.now().toISOString() }
      return record
    }, 'requeued')
  }
  update(scope, taskId, expectedVersion, mutate, eventType) {
    const lock = `${this.file(taskId)}.lock`
    const descriptor = this.acquireLock(lock)
    try {
      // Inside the try: if this throws, the finally below still closes the
      // descriptor and removes the lock. Outside it, a storage failure leaked
      // the descriptor and left the lock until stale recovery, and repeated
      // failures would exhaust file descriptors while blocking every update.
      fs.writeFileSync(descriptor, JSON.stringify({ pid: process.pid, at: this.now().toISOString() }))
      const record = this.get(scope, taskId)
      if (!record) return null
      if (record.version !== expectedVersion) throw new OrchestrationConflictError('Task version changed; reload before updating.')
      const next = mutate(clone(record))
      next.version += 1
      next.updatedAt = this.now().toISOString()
      next.events.push({ id: crypto.randomUUID(), type: eventType, at: next.updatedAt, version: next.version })
      return this.write(next)
    } finally {
      if (descriptor !== undefined) fs.closeSync(descriptor)
      fs.rmSync(lock, { force: true })
    }
  }
  transition(scope, taskId, expectedVersion, state, details = {}) {
    return this.update(scope, taskId, expectedVersion, (record) => {
      if (!transitions[record.state]?.includes(state)) throw new OrchestrationConflictError(`Cannot transition ${record.state} to ${state}.`)
      record.state = state
      Object.assign(record, details)
      return record
    }, `state:${state}`)
  }
  approve(scope, taskId, expectedVersion, decision, actor) {
    // Anything other than the two valid decisions was previously persisted
    // verbatim and treated as a cancellation, so a missing field or a typo like
    // 'approvd' permanently cancelled the task while returning success to the
    // caller. Reject it before the record is touched.
    if (decision !== 'approved' && decision !== 'rejected') {
      throw new TypeError("Approval decision must be 'approved' or 'rejected'.")
    }
    return this.update(scope, taskId, expectedVersion, (record) => {
      if (record.state !== 'waiting_approval' || record.approval.state !== 'pending') throw new OrchestrationConflictError('Task is not awaiting approval.')
      record.approval = { state: decision, actor, at: this.now().toISOString() }
      record.state = decision === 'approved' ? 'queued' : 'cancelled'
      return record
    }, `approval:${decision}`)
  }
  claim(scope, taskId, expectedVersion, workerId, leaseMs = 30_000) {
    return this.update(scope, taskId, expectedVersion, (record) => {
      if (!['queued', 'accepted'].includes(record.state)) throw new OrchestrationConflictError('Task cannot be claimed.')
      record.state = 'running'; record.attempt += 1
      record.lease = { workerId, expiresAt: new Date(this.now().getTime() + leaseMs).toISOString() }
      return record
    }, 'claimed')
  }
  publishProgress(scope, taskId, expectedVersion, progress) {
    return this.update(scope, taskId, expectedVersion, (record) => {
      if (record.state !== 'running') throw new OrchestrationConflictError('Only running tasks accept progress.')
      record.progress = { summary: progress.summary, percent: progress.percent ?? null, at: this.now().toISOString() }
      return record
    }, 'progress')
  }
  complete(scope, taskId, expectedVersion, result) {
    return this.update(scope, taskId, expectedVersion, (record) => {
      if (record.state !== 'running') throw new OrchestrationConflictError('Only running tasks can complete.')
      const payload = { summary: result.summary, evidence: result.evidence ?? [], artifacts: result.artifacts ?? [], verification: result.verification ?? { state: 'unverified' }, contextUpdates: result.contextUpdates ?? [] }
      record.state = 'succeeded'; record.lease = null; record.result = { ...payload, integrity: { algorithm: 'sha256', digest: digest(payload) } }
      return record
    }, 'completed')
  }
  recoverExpiredLeases(scope) {
    const now = this.now().getTime()
    return this.list(scope).filter((record) => record.state === 'running' && Date.parse(record.lease?.expiresAt ?? '') <= now)
      .map((record) => this.update(scope, record.id, record.version, (next) => { next.state = 'queued'; next.lease = null; return next }, 'recovered'))
  }
  acknowledge(scope, taskId, expectedVersion) {
    return this.update(scope, taskId, expectedVersion, (record) => {
      if (!terminalStates.has(record.state)) throw new OrchestrationConflictError('Only terminal tasks can be acknowledged.')
      record.notification = 'acknowledged'; return record
    }, 'acknowledged')
  }
}
