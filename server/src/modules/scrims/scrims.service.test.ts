import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'
import { db } from '../../infrastructure/database/client'
import { redis, REDIS_KEYS } from '../../infrastructure/redis/client'
import { AppError } from '../../shared/errors/AppError'
import { buildScrimMatchPlayers, createAdminScrim } from './scrims.service'

const originals = {
  userFindMany: db.user.findMany.bind(db.user),
  matchCreate: db.match.create.bind(db.match),
  matchUpdate: db.match.update.bind(db.match),
  executeRaw: db.$executeRaw.bind(db),
  redisDel: redis.del.bind(redis),
  redisSetex: redis.setex.bind(redis),
}

afterEach(() => {
  ;(db.user as any).findMany = originals.userFindMany
  ;(db.match as any).create = originals.matchCreate
  ;(db.match as any).update = originals.matchUpdate
  ;(db as any).$executeRaw = originals.executeRaw
  ;(redis as any).del = originals.redisDel
  ;(redis as any).setex = originals.redisSetex
})

test('buildScrimMatchPlayers requires one captain per scrim side', () => {
  assert.throws(
    () => buildScrimMatchPlayers({
      captain1UserId: 'captain-a',
      captain2UserId: '',
      team1PlayerIds: ['captain-a'],
      team2PlayerIds: ['player-b'],
    }),
    /capit/i,
  )
})

test('buildScrimMatchPlayers creates two teams with captain flags and placeholder slots', () => {
  const players = buildScrimMatchPlayers({
    captain1UserId: 'captain-a',
    captain2UserId: 'captain-b',
    team1PlayerIds: ['captain-a', 'player-a2'],
    team2PlayerIds: ['captain-b'],
  })

  assert.deepEqual(players.map((player) => ({ team: player.team, userId: player.userId, isCaptain: player.isCaptain, isBot: player.isBot })), [
    { team: 1, userId: 'captain-a', isCaptain: true, isBot: false },
    { team: 1, userId: 'player-a2', isCaptain: false, isBot: false },
    { team: 1, userId: null, isCaptain: false, isBot: true },
    { team: 1, userId: null, isCaptain: false, isBot: true },
    { team: 1, userId: null, isCaptain: false, isBot: true },
    { team: 2, userId: 'captain-b', isCaptain: true, isBot: false },
    { team: 2, userId: null, isCaptain: false, isBot: true },
    { team: 2, userId: null, isCaptain: false, isBot: true },
    { team: 2, userId: null, isCaptain: false, isBot: true },
    { team: 2, userId: null, isCaptain: false, isBot: true },
  ])
})

test('createAdminScrim creates a TEAM match, scrim metadata, and veto runtime', async () => {
  const redisWrites: Array<{ key: string; ttl: number; value: string }> = []
  const redisDeletes: string[] = []
  const created: any[] = []
  const rawWrites: unknown[] = []

  ;(db.user as any).findMany = async () => [
    { id: 'captain-a', mmr: 1500 },
    { id: 'player-a2', mmr: 1400 },
    { id: 'captain-b', mmr: 1450 },
  ]
  ;(db.match as any).create = async (args: any) => {
    created.push(args)
    return {
      id: 'match-scrim-1',
      status: 'VETOING',
      mode: 'TEAM',
      region: 'SA',
      scrimDetails: args.data.scrimDetails?.create
        ? { matchId: 'match-scrim-1', ...args.data.scrimDetails.create }
        : undefined,
      players: args.data.players.create.map((player: any, index: number) => ({ id: `mp-${index}`, ...player })),
    }
  }
  ;(db.match as any).update = async () => ({
    id: 'match-scrim-1',
    players: created[0].data.players.create.filter((player: any) => player.isCaptain),
  })
  ;(db as any).$executeRaw = async (query: unknown) => { rawWrites.push(query); return 1 }
  ;(redis as any).del = async (key: string) => { redisDeletes.push(key); return 1 }
  ;(redis as any).setex = async (key: string, ttl: number, value: string) => { redisWrites.push({ key, ttl, value }); return 'OK' }

  const result = await createAdminScrim({
    actorId: 'admin-1',
    team1Name: 'Storm Alpha',
    team2Name: 'Nexus Beta',
    captain1UserId: 'captain-a',
    captain2UserId: 'captain-b',
    team1PlayerIds: ['captain-a', 'player-a2'],
    team2PlayerIds: ['captain-b'],
    notes: 'Bo3 training',
  })

  assert.equal(result.id, 'match-scrim-1')
  assert.equal(created[0].data.mode, 'TEAM')
  assert.equal(created[0].data.status, 'VETOING')
  assert.equal(created[0].data.scrimDetails.create.team1Name, 'Storm Alpha')
  assert.equal(rawWrites.length, 0)
  assert.equal(result.scrimDetails.team1Name, 'Storm Alpha')
  assert.equal(result.scrimDetails.createdById, 'admin-1')
  assert.equal(redisDeletes[0], REDIS_KEYS.pendingMatch('match-scrim-1'))
  assert.equal(redisWrites[0].key, REDIS_KEYS.matchVetoState('match-scrim-1'))
  const vetoState = JSON.parse(redisWrites[0].value)
  assert.equal(vetoState.captains[1], 'captain-a')
  assert.equal(vetoState.captains[2], 'captain-b')
})

test('createAdminScrim rejects rosters with unknown user ids', async () => {
  ;(db.user as any).findMany = async () => [
    { id: 'captain-a', mmr: 1500 },
    { id: 'captain-b', mmr: 1450 },
  ]

  await assert.rejects(
    () => createAdminScrim({
      actorId: 'admin-1',
      team1Name: 'Storm Alpha',
      team2Name: 'Nexus Beta',
      captain1UserId: 'captain-a',
      captain2UserId: 'captain-b',
      team1PlayerIds: ['captain-a', 'ghost-user'],
      team2PlayerIds: ['captain-b'],
    }),
    (error) => {
      assert.ok(error instanceof AppError)
      assert.equal(error.statusCode, 422)
      assert.match(error.message, /ghost-user/)
      return true
    },
  )
})
