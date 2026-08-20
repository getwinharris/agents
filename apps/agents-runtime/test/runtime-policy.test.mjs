import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  authorizeWorkspaceRuntimeRequest,
  authorizeWorkspaceVerificationRequest,
  isAuthorizedRuntimeRequest,
} from '../src/runtime-policy.mjs'

describe('isAuthorizedRuntimeRequest()', () => {
  it('authorizes an exact non-empty shared token', () => {
    assert.equal(isAuthorizedRuntimeRequest('runtime-secret', 'runtime-secret'), true)
  })

  it('rejects a missing, empty, or different shared token', () => {
    assert.equal(isAuthorizedRuntimeRequest(undefined, undefined), false)
    assert.equal(isAuthorizedRuntimeRequest('', ''), false)
    assert.equal(isAuthorizedRuntimeRequest('runtime-secret', 'different'), false)
  })
})

describe('authorizeWorkspaceRuntimeRequest()', () => {
  it('returns one canonical customer business scope when the gateway claims agree', () => {
    assert.deepEqual(
      authorizeWorkspaceRuntimeRequest({
        expectedToken: 'runtime-secret',
        suppliedToken: 'runtime-secret',
        account: 'routing-user',
        workspaceScope: 'users/routing-user/workspace',
      }),
      { account: 'routing-user', business: 'workspace', workspaceScope: 'users/routing-user/workspace' },
    )
  })

  it('rejects missing, malformed, traversal-like, and account-mismatched scope claims', () => {
    for (const input of [
      { account: 'routing-user', workspaceScope: undefined },
      { account: 'Routing-User', workspaceScope: 'users/routing-user/workspace' },
      { account: 'routing-user', workspaceScope: 'users/other-user/workspace' },
      { account: 'routing-user', workspaceScope: 'users/routing-user/../other' },
      { account: 'routing-user', workspaceScope: '/users/routing-user/workspace' },
      { account: 'routing-user', workspaceScope: 'users/routing-user/workspace/projects/example' },
    ]) {
      assert.equal(
        authorizeWorkspaceRuntimeRequest({
          expectedToken: 'runtime-secret',
          suppliedToken: 'runtime-secret',
          ...input,
        }),
        null,
      )
    }
  })

  it('rejects otherwise valid scope claims when the private runtime token is invalid', () => {
    assert.equal(
      authorizeWorkspaceRuntimeRequest({
        expectedToken: 'runtime-secret',
        suppliedToken: 'different',
        account: 'routing-user',
        workspaceScope: 'users/routing-user/workspace',
      }),
      null,
    )
  })
})

describe('authorizeWorkspaceVerificationRequest()', () => {
  it('binds verifier input to the trusted gateway claims', () => {
    assert.deepEqual(
      authorizeWorkspaceVerificationRequest({
        expectedToken: 'runtime-secret',
        suppliedToken: 'runtime-secret',
        account: 'routing-user',
        workspaceScope: 'users/routing-user/workspace',
        submitted: { account: 'routing-user', workspaceScope: 'users/routing-user/workspace' },
      }),
      { account: 'routing-user', business: 'workspace', workspaceScope: 'users/routing-user/workspace' },
    )
  })

  it('rejects verifier input that differs from either trusted claim', () => {
    for (const submitted of [
      null,
      { account: 'other-user', workspaceScope: 'users/routing-user/workspace' },
      { account: 'routing-user', workspaceScope: 'users/routing-user/other' },
    ]) {
      assert.equal(
        authorizeWorkspaceVerificationRequest({
          expectedToken: 'runtime-secret',
          suppliedToken: 'runtime-secret',
          account: 'routing-user',
          workspaceScope: 'users/routing-user/workspace',
          submitted,
        }),
        null,
      )
    }
  })
})
