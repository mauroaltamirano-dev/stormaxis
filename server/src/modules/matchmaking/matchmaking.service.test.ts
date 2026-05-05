import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'
import { db } from '../../infrastructure/database/client'
import { redis, REDIS_KEYS } from '../../infrastructure/redis/client'
import { AppError } from '../../shared/errors/AppError'
import { joinQueue } from './matchmaking.service'

const originals = {
  redisGet: redis.get.bind(redis),
  redisZadd: redis.zadd.bind(redis),
  redisSetex: redis.setex.bind(redis),
  matchPlayerFindFirst: db.matchPlayer.findFirst.bind(db.matchPlayer),
  userFindUnique: db.user.findUnique.bind(db.user),
  scrimSearchFindFirst: (db as any).scrimSearch.findFirst.bind((db as any).scrimSearch),
}

type JoinQueueMocks = {
  queued?: string | null
  activeMatch?: { matchId: string } | null
  activeScrimSearch?: { id: string } | null
  user?: {
    mmr: number
    isBanned: boolean
    mainRole: string | null
    secondaryRole: string | null
  } | null
}

function mockJoinQueueDependencies({
  queued = null,
  activeMatch = null,
  activeScrimSearch = null,
  user = {
    mmr: 1420,
    isBanned: false,
    mainRole: 'TANK',
    secondaryRole: 'OFFLANE',
  },
}: JoinQueueMocks = {}) {
  const writes = {
    zadd: [] as Array<{ key: string; score: number; member: string }>,
    setex: [] as Array<{ key: string; ttl: number; value: string }>,
  }

  ;(redis as any).get = async (key: string) => {
    if (key === REDIS_KEYS.userInQueue('user-1')) return queued
    return null
  }
  ;(redis as any).zadd = async (key: string, score: number, member: string) => {
    writes.zadd.push({ key, score, member })
    return 1
  }
  ;(redis as any).setex = async (key: string, ttl: number, value: string) => {
    writes.setex.push({ key, ttl, value })
    return 'OK'
  }
  ;(db.matchPlayer as any).findFirst = async () => activeMatch
  ;(db as any).scrimSearch.findFirst = async () => activeScrimSearch
  ;(db.user as any).findUnique = async () => user

  return writes
}

afterEach(() => {
  ;(redis as any).get = originals.redisGet
  ;(redis as any).zadd = originals.redisZadd
  ;(redis as any).setex = originals.redisSetex
  ;(db.matchPlayer as any).findFirst = originals.matchPlayerFindFirst
  ;(db.user as any).findUnique = originals.userFindUnique
  ;(db as any).scrimSearch.findFirst = originals.scrimSearchFindFirst
})

async function assertJoinQueueError(expectedMessage: string, mocks: JoinQueueMocks) {
  mockJoinQueueDependencies(mocks)

  await assert.rejects(
    () => joinQueue('user-1', 'COMPETITIVE'),
    (error) => {
      assert.ok(error instanceof AppError)
      assert.equal(error.statusCode, 409)
      assert.equal(error.message, expectedMessage)
      return true
    },
  )
}

test('joinQueue blocks users already in queue', async () => {
  await assertJoinQueueError('Already in queue', { queued: '{"mode":"COMPETITIVE"}' })
})

test('joinQueue blocks users with an active match', async () => {
  await assertJoinQueueError('Cannot join queue while you have an active match', {
    activeMatch: { matchId: 'match-1' },
  })
})

test('joinQueue blocks users selected in an open scrim search', async () => {
  await assertJoinQueueError('Cannot join queue while selected in an open scrim search', {
    activeScrimSearch: { id: 'scrim-search-1' },
  })
})

test('joinQueue requires both competitive roles before queueing', async () => {
  await assertJoinQueueError('Complete your competitive roles before joining the queue', {
    user: {
      mmr: 1420,
      isBanned: false,
      mainRole: 'TANK',
      secondaryRole: null,
    },
  })
})

test('joinQueue writes queue score and metadata for eligible users', async () => {
  const writes = mockJoinQueueDependencies()

  const result = await joinQueue('user-1', 'COMPETITIVE')

  assert.deepEqual(result, { mmr: 1420 })
  assert.deepEqual(writes.zadd, [
    { key: REDIS_KEYS.matchmakingQueue('SA'), score: 1420, member: 'user-1' },
  ])
  assert.equal(writes.setex.length, 1)
  assert.equal(writes.setex[0].key, REDIS_KEYS.userInQueue('user-1'))
  assert.equal(writes.setex[0].ttl, 600)

  const metadata = JSON.parse(writes.setex[0].value)
  assert.equal(metadata.mode, 'COMPETITIVE')
  assert.equal(metadata.mmr, 1420)
  assert.deepEqual(metadata.roles, ['TANK', 'OFFLANE'])
  assert.equal(typeof metadata.joinedAt, 'number')
})
