import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { isAuthorizedRuntimeRequest } from '../src/runtime-policy.mjs'

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
