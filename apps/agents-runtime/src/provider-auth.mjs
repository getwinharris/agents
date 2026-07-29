import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { loginOpenAICodexDeviceCode, refreshOpenAICodexToken } from '@earendil-works/pi-ai/oauth'

function keyFrom(value) {
  const key = value ? Buffer.from(value, 'base64') : Buffer.alloc(0)
  if (key.length !== 32) throw new Error('BAPX_CREDENTIAL_ENCRYPTION_KEY must be a base64-encoded 32-byte key.')
  return key
}
function scopeKey(scope) { return `${scope.account}--${scope.business}` }

export class WorkspaceCredentialStore {
  constructor({ directory, encryptionKey }) { this.directory = directory; this.key = keyFrom(encryptionKey); fs.mkdirSync(directory, { recursive: true, mode: 0o700 }) }
  file(scope, provider) { return path.join(this.directory, scopeKey(scope), `${provider}.json.enc`) }
  async read(scope, provider) {
    try {
      const payload = JSON.parse(fs.readFileSync(this.file(scope, provider), 'utf8'))
      const decipher = crypto.createDecipheriv('aes-256-gcm', this.key, Buffer.from(payload.iv, 'base64'))
      decipher.setAuthTag(Buffer.from(payload.tag, 'base64'))
      return JSON.parse(Buffer.concat([decipher.update(Buffer.from(payload.data, 'base64')), decipher.final()]).toString('utf8'))
    } catch (error) { if (error.code === 'ENOENT') return undefined; throw error }
  }
  async modify(scope, provider, update) {
    const credential = await update(await this.read(scope, provider))
    if (!credential) return credential
    const iv = crypto.randomBytes(12)
    const cipher = crypto.createCipheriv('aes-256-gcm', this.key, iv)
    const data = Buffer.concat([cipher.update(JSON.stringify(credential)), cipher.final()])
    const file = this.file(scope, provider); fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 })
    const temporary = `${file}.${crypto.randomUUID()}.tmp`
    fs.writeFileSync(temporary, JSON.stringify({ version: 1, iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), data: data.toString('base64') }), { mode: 0o600 })
    fs.renameSync(temporary, file)
    return credential
  }
  async delete(scope, provider) { fs.rmSync(this.file(scope, provider), { force: true }) }
}

const flows = new Map()
export async function startOpenAIDeviceAuthorization({ scope, store, login = loginOpenAICodexDeviceCode }) {
  const id = crypto.randomUUID(); const abort = new AbortController()
  let reveal
  const device = new Promise((resolve) => { reveal = resolve })
  const completion = login({ signal: abort.signal, onDeviceCode: reveal }).then(async (credential) => {
    await store.modify(scope, 'openai-codex', async () => ({ ...credential, type: 'oauth' }))
    flows.set(id, { state: 'connected', scope: scopeKey(scope) })
  }).catch((cause) => flows.set(id, { state: abort.signal.aborted ? 'cancelled' : 'failed', error: cause.message, scope: scopeKey(scope) }))
  flows.set(id, { state: 'awaiting_user', scope: scopeKey(scope), abort, completion })
  const info = await device
  return { id, state: 'awaiting_user', verificationUri: info.verificationUri, userCode: info.userCode, expiresInSeconds: info.expiresInSeconds }
}
export function deviceAuthorizationStatus(scope, id) {
  const flow = flows.get(id)
  if (!flow || flow.scope !== scopeKey(scope)) return null
  return { id, state: flow.state, ...(flow.error ? { error: flow.error } : {}) }
}
export async function resolveOpenAICodexCredential({ scope, store, now = Date.now() }) {
  let credential = await store.read(scope, 'openai-codex')
  if (!credential) return undefined
  if (credential.expires <= now + 60_000) credential = await store.modify(scope, 'openai-codex', async (current) => ({ ...(await refreshOpenAICodexToken(current.refresh)), type: 'oauth' }))
  return credential
}
