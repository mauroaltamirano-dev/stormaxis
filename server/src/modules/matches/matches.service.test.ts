import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { after, afterEach, before, test } from 'node:test'
import type { Server as SocketServer } from 'socket.io'
import { db } from '../../infrastructure/database/client'
import { redis, REDIS_KEYS } from '../../infrastructure/redis/client'
import { createSocketServer } from '../../infrastructure/socket/server'
import { AppError } from '../../shared/errors/AppError'
import { applyReplayWinnerResolution, finishMatch } from './matches.service'

const originals = {
  matchFindUnique: db.match.findUnique.bind(db.match),
  matchUpdate: db.match.update.bind(db.match),
  voteGroupBy: db.vote.groupBy.bind(db.vote),
  redisGet: redis.get.bind(redis),
  redisSetex: redis.setex.bind(redis),
  redisDel: redis.del.bind(redis),
}

let io: SocketServer
let emitted: Array<{ room: string; event: string; payload: unknown }> = []

type MockMatch = {
  status: string
  winner: number | null
  players: Array<{ userId: string | null; isBot: boolean; isCaptain?: boolean }>
}

function mockMatch(match: MockMatch | null) {
  ;(db.match as any).findUnique = async () => match
}

before(() => {
  io = createSocketServer(createServer())
  ;(io as any).to = (room: string) => ({
    emit(event: string, payload: unknown) {
      emitted.push({ room, event, payload })
      return true
    },
  })
})

afterEach(() => {
  emitted = []
  ;(db.match as any).findUnique = originals.matchFindUnique
  ;(db.match as any).update = originals.matchUpdate
  ;(db.vote as any).groupBy = originals.voteGroupBy
  ;(redis as any).get = originals.redisGet
  ;(redis as any).setex = originals.redisSetex
  ;(redis as any).del = originals.redisDel
})

after(() => {
  io.close()
})

const TRUSTED_REPLAY_VALIDATION = {
  mapMatches: true,
  expectedHumanPlayers: 10,
  matchedPlayers: 10,
  minimumMatchedPlayers: 6,
  battleTagMatchedPlayers: 8,
  battleTagMismatches: 0,
  teamMismatches: 0,
  identityConfidence: 'high' as const,
  trustScore: 92,
}

function buildUpload(overrides: Partial<Parameters<typeof applyReplayWinnerResolution>[1]> = {}) {
  return {
    status: 'PARSED',
    parsedWinnerTeam: 1 as const,
    parsedSummary: {
      validation: TRUSTED_REPLAY_VALIDATION,
    },
    ...overrides,
  }
}

function votingMatch(overrides: Partial<MockMatch> = {}): MockMatch {
  return {
    status: 'COMPLETED',
    winner: null,
    players: Array.from({ length: 10 }, (_, index) => ({
      userId: `user-${index + 1}`,
      isBot: false,
      isCaptain: index < 2,
    })),
    ...overrides,
  }
}

function playableMatch(overrides: Partial<MockMatch> = {}): MockMatch {
  return {
    status: 'PLAYING',
    winner: null,
    players: Array.from({ length: 10 }, (_, index) => ({
      userId: `user-${index + 1}`,
      isBot: false,
      isCaptain: index < 2,
    })),
    ...overrides,
  }
}

function mockFinishMatchDependencies(options: {
  match?: MockMatch | null
  readyBy?: Array<string | null>
  totalPlayers?: number
  finishState?: { captainIds: string[]; requestedBy: string[] } | null
} = {}) {
  const match = options.match ?? playableMatch()
  const readyBy = options.readyBy ?? match.players.filter((player) => !player.isBot && player.userId).map((player) => player.userId)
  const totalPlayers = options.totalPlayers ?? match.players.filter((player) => !player.isBot && player.userId).length
  const finishState = options.finishState ?? null
  const writes = {
    setex: [] as Array<{ key: string; ttl: number; value: string }>,
    del: [] as string[],
    updates: [] as Array<{ where: unknown; data: unknown }>,
  }

  ;(db.match as any).findUnique = async (args: { select?: { status?: boolean } }) => {
    if (args?.select?.status) return match ? { status: match.status } : null
    return match
  }
  ;(db.match as any).update = async (args: { where: unknown; data: unknown }) => {
    writes.updates.push(args)
    return { id: 'match-1', ...(match ?? {} as MockMatch), ...(args.data as object) }
  }
  ;(db.vote as any).groupBy = async () => []
  ;(redis as any).get = async (key: string) => {
    if (key === REDIS_KEYS.matchReadyState('match-1')) {
      return JSON.stringify({ readyBy, totalPlayers })
    }
    if (key === REDIS_KEYS.matchFinishState('match-1')) {
      return finishState ? JSON.stringify(finishState) : null
    }
    return null
  }
  ;(redis as any).setex = async (key: string, ttl: number, value: string) => {
    writes.setex.push({ key, ttl, value })
    return 'OK'
  }
  ;(redis as any).del = async (key: string) => {
    writes.del.push(key)
    return 1
  }

  return writes
}

test('replay decision keeps manual flow when parser did not produce a parsed replay', async () => {
  mockMatch(votingMatch())

  const decision = await applyReplayWinnerResolution('match-1', buildUpload({ status: 'FAILED' }))

  assert.equal(decision.status, 'parser_failed')
  assert.equal(decision.autoApplied, false)
  assert.equal(decision.replayWinner, 1)
})

test('replay decision requires the replay map to match the platform match', async () => {
  mockMatch(votingMatch())

  const decision = await applyReplayWinnerResolution(
    'match-1',
    buildUpload({
      parsedSummary: {
        validation: {
          ...TRUSTED_REPLAY_VALIDATION,
          mapMatches: false,
        },
      },
    }),
  )

  assert.equal(decision.status, 'awaiting_manual_vote')
  assert.equal(decision.mapMatches, false)
  assert.equal(decision.eligibleForAutoWinner, false)
})

test('replay decision requires enough trusted identity before auto result', async () => {
  mockMatch(votingMatch())

  const decision = await applyReplayWinnerResolution(
    'match-1',
    buildUpload({
      parsedSummary: {
        validation: {
          ...TRUSTED_REPLAY_VALIDATION,
          trustScore: 45,
        },
      },
    }),
  )

  assert.equal(decision.status, 'awaiting_manual_vote')
  assert.equal(decision.trustScore, 45)
  assert.equal(decision.eligibleForAutoWinner, false)
})

test('replay decision verifies an already resolved winner when replay agrees', async () => {
  mockMatch(votingMatch({ winner: 1 }))

  const decision = await applyReplayWinnerResolution('match-1', buildUpload())

  assert.equal(decision.status, 'verified_existing_result')
  assert.equal(decision.existingWinner, 1)
  assert.equal(decision.eligibleForAutoWinner, true)
})

test('replay decision flags discrepancy when replay winner differs from platform winner', async () => {
  mockMatch(votingMatch({ winner: 2 }))

  const decision = await applyReplayWinnerResolution('match-1', buildUpload())

  assert.equal(decision.status, 'winner_mismatch')
  assert.equal(decision.existingWinner, 2)
  assert.equal(decision.replayWinner, 1)
  assert.equal(decision.autoApplied, false)
})

test('finishMatch only allows captains to start match completion', async () => {
  mockFinishMatchDependencies()

  await assert.rejects(
    () => finishMatch('match-1', 'user-3'),
    (error) => {
      assert.ok(error instanceof AppError)
      assert.equal(error.code, 'FORBIDDEN')
      assert.equal(error.statusCode, 403)
      return true
    },
  )
})

test('finishMatch requires every human player to be connected before completion', async () => {
  mockFinishMatchDependencies({ readyBy: ['user-1', 'user-2'], totalPlayers: 10 })

  await assert.rejects(
    () => finishMatch('match-1', 'user-1'),
    (error) => {
      assert.ok(error instanceof AppError)
      assert.equal(error.code, 'CONFLICT')
      assert.equal(error.message, 'Not all players have connected yet')
      return true
    },
  )
})

test('finishMatch records the first captain confirmation without opening voting', async () => {
  const writes = mockFinishMatchDependencies()

  await finishMatch('match-1', 'user-1')

  assert.equal(writes.setex.length, 1)
  assert.equal(writes.setex[0].key, REDIS_KEYS.matchFinishState('match-1'))
  assert.deepEqual(JSON.parse(writes.setex[0].value), {
    captainIds: ['user-1', 'user-2'],
    requestedBy: ['user-1'],
  })
  assert.deepEqual(writes.updates, [])
  assert.deepEqual(writes.del, [])
  assert.deepEqual(emitted.map((entry) => entry.event), ['match:finish:update'])
})

test('finishMatch opens winner voting when both captains confirm completion', async () => {
  const writes = mockFinishMatchDependencies({
    finishState: {
      captainIds: ['user-1', 'user-2'],
      requestedBy: ['user-1'],
    },
  })

  await finishMatch('match-1', 'user-2')

  assert.deepEqual(writes.updates, [
    { where: { id: 'match-1' }, data: { status: 'VOTING' } },
  ])
  assert.ok(writes.setex.some((entry) => entry.key === REDIS_KEYS.matchFinishState('match-1')))
  const votingWrite = writes.setex.find((entry) => entry.key === REDIS_KEYS.matchVotingState('match-1'))
  assert.ok(votingWrite)
  assert.equal(votingWrite.ttl, 150)
  assert.equal(JSON.parse(votingWrite.value).totalPlayers, 10)
  assert.deepEqual(writes.del, [REDIS_KEYS.matchFinishState('match-1')])
  assert.deepEqual(emitted.map((entry) => entry.event), [
    'match:finish:update',
    'vote:start',
  ])
})
