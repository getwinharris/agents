import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, it } from 'node:test'
import { deviceAuthorizationStatus, startOpenAIDeviceAuthorization, WorkspaceCredentialStore } from '../src/provider-auth.mjs'

const directories = []
afterEach(() => { for (const directory of directories.splice(0)) fs.rmSync(directory, { recursive: true, force: true }) })
function fixture() { const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'bapx-auth-')); directories.push(directory); return { directory, store: new WorkspaceCredentialStore({ directory, encryptionKey: crypto.randomBytes(32).toString('base64') }) } }
const alpha = { account: 'alpha-user', business: 'acme', workspaceScope: 'users/alpha-user/acme' }
const beta = { account: 'beta-user', business: 'acme', workspaceScope: 'users/beta-user/acme' }

describe('WorkspaceCredentialStore', () => {
  it('encrypts OAuth credentials inside the owning workspace boundary', async () => {
    const { directory, store } = fixture()
    await store.modify(alpha, 'openai-codex', async () => ({ type: 'oauth', access: 'secret-access', refresh: 'secret-refresh', expires: Date.now() + 60_000 }))
    assert.equal(await store.read(beta, 'openai-codex'), undefined)
    const bytes = fs.readFileSync(path.join(directory, 'alpha-user--acme', 'openai-codex.json.enc'), 'utf8')
    assert.doesNotMatch(bytes, /secret-access|secret-refresh/)
    assert.equal((await store.read(alpha, 'openai-codex')).access, 'secret-access')
  })

  it('returns only device consent metadata and persists the completed OAuth credential', async () => {
    const { store } = fixture()
    let finish
    const login = async ({ onDeviceCode }) => { onDeviceCode({ userCode: 'ABCD-EFGH', verificationUri: 'https://auth.openai.com/codex/device', expiresInSeconds: 900 }); await new Promise((resolve) => { finish = resolve }); return { access: 'access', refresh: 'refresh', expires: Date.now() + 60_000 } }
    const started = await startOpenAIDeviceAuthorization({ scope: alpha, store, login })
    assert.deepEqual(started, { id: started.id, state: 'awaiting_user', verificationUri: 'https://auth.openai.com/codex/device', userCode: 'ABCD-EFGH', expiresInSeconds: 900 })
    assert.equal(deviceAuthorizationStatus(beta, started.id), null)
    finish(); await new Promise((resolve) => setImmediate(resolve))
    assert.equal(deviceAuthorizationStatus(alpha, started.id).state, 'connected')
    assert.equal((await store.read(alpha, 'openai-codex')).type, 'oauth')
  })
})
