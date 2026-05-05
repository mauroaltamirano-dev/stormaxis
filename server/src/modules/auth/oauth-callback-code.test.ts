import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'
import { redis } from '../../infrastructure/redis/client'
import { createOAuthCallbackCode, consumeOAuthCallbackCode } from './auth.service'

const original = {
  set: (redis as any).set,
  get: (redis as any).get,
  del: (redis as any).del,
}

afterEach(() => {
  ;(redis as any).set = original.set
  ;(redis as any).get = original.get
  ;(redis as any).del = original.del
})

test('createOAuthCallbackCode stores access token with short TTL and opaque code', async () => {
  const calls: any[] = []
  ;(redis as any).set = async (...args: any[]) => { calls.push(args); return 'OK' }

  const code = await createOAuthCallbackCode('access-token-1')

  assert.match(code, /^[a-f0-9-]{36}$/)
  assert.equal(calls.length, 1)
  assert.equal(calls[0][0], `oauth_callback:${code}`)
  assert.equal(calls[0][1], 'access-token-1')
  assert.equal(calls[0][2], 'EX')
  assert.equal(calls[0][3], 60)
})

test('consumeOAuthCallbackCode returns token once and deletes the code', async () => {
  const deleted: string[] = []
  ;(redis as any).get = async (key: string) => key === 'oauth_callback:code-1' ? 'access-token-1' : null
  ;(redis as any).del = async (key: string) => { deleted.push(key); return 1 }

  const token = await consumeOAuthCallbackCode('code-1')

  assert.equal(token, 'access-token-1')
  assert.deepEqual(deleted, ['oauth_callback:code-1'])
})

test('consumeOAuthCallbackCode rejects blank or missing codes', async () => {
  let getCalled = false
  ;(redis as any).get = async () => { getCalled = true; return null }

  await assert.rejects(() => consumeOAuthCallbackCode('  '), /Unauthorized|UNAUTHORIZED/i)
  await assert.rejects(() => consumeOAuthCallbackCode('missing-code'), /Unauthorized|UNAUTHORIZED/i)
  assert.equal(getCalled, true)
})
