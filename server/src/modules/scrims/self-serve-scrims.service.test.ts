import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'
import { db } from '../../infrastructure/database/client'
import { redis, REDIS_KEYS } from '../../infrastructure/redis/client'
import { AppError } from '../../shared/errors/AppError'
import { acceptTeamScrimChallenge, createTeamScrimSearch, listSelfServeScrimsForUser } from './scrims.service'

const original = {
  teamMember: (db as any).teamMember,
  scrimSearch: (db as any).scrimSearch,
  scrimChallenge: (db as any).scrimChallenge,
  teamInvite: (db as any).teamInvite,
  match: db.match,
  user: db.user,
  scrimAccess: (db as any).scrimAccess,
  transaction: (db as any).$transaction,
  redisSetex: redis.setex.bind(redis),
}

afterEach(() => {
  ;(db as any).teamMember = original.teamMember
  ;(db as any).scrimSearch = original.scrimSearch
  ;(db as any).scrimChallenge = original.scrimChallenge
  ;(db as any).teamInvite = original.teamInvite
  ;(db as any).match = original.match
  ;(db as any).user = original.user
  ;(db as any).scrimAccess = original.scrimAccess
  ;(db as any).$transaction = original.transaction
  ;(redis as any).setex = original.redisSetex
})

const activeMembers = [
  'leader-a', 'a1', 'a2', 'a3', 'a4', 'coach-a', 'obs-a1', 'obs-a2',
].map((userId) => ({ userId, status: 'ACTIVE', user: { id: userId, isBot: false } }))

const activeMembersWithBots = [
  { userId: 'leader-a', status: 'ACTIVE', user: { id: 'leader-a', isBot: false } },
  { userId: 'bot-a1', status: 'ACTIVE', user: { id: 'bot-a1', isBot: true } },
  { userId: 'bot-a2', status: 'ACTIVE', user: { id: 'bot-a2', isBot: true } },
  { userId: 'bot-a3', status: 'ACTIVE', user: { id: 'bot-a3', isBot: true } },
  { userId: 'bot-a4', status: 'ACTIVE', user: { id: 'bot-a4', isBot: true } },
]

test('createTeamScrimSearch requires exactly 5 online starters', async () => {
  ;(db as any).teamMember = {
    findFirst: async () => ({ role: 'OWNER' }),
    findMany: async () => activeMembers,
  }
  ;(db as any).scrimSearch = {
    findFirst: async () => null,
    create: async () => assert.fail('search should not be created'),
  }

  await assert.rejects(
    () => createTeamScrimSearch('leader-a', {
      teamId: 'team-a',
      starterUserIds: ['leader-a', 'a1', 'a2', 'a3', 'a4'],
      coachUserId: 'coach-a',
      observerUserIds: ['obs-a1'],
    }, new Set(['leader-a', 'a1', 'a2', 'a3'])),
    (error) => {
      assert.ok(error instanceof AppError)
      assert.equal(error.statusCode, 422)
      assert.match(error.message, /online starters/i)
      return true
    },
  )
})

test('createTeamScrimSearch stores starters, coach, observers, and blocks duplicate open searches', async () => {
  const created: any[] = []
  ;(db as any).teamMember = {
    findFirst: async () => ({ role: 'CAPTAIN' }),
    findMany: async () => activeMembers,
  }
  ;(db as any).scrimSearch = {
    findFirst: async () => null,
    create: async (args: any) => { created.push(args); return { id: 'search-a', ...args.data } },
  }

  const result = await createTeamScrimSearch('leader-a', {
    teamId: 'team-a',
    starterUserIds: ['leader-a', 'a1', 'a2', 'a3', 'a4'],
    coachUserId: 'coach-a',
    observerUserIds: ['obs-a1', 'obs-a2'],
    notes: 'Bo3 ahora',
  }, new Set(['leader-a', 'a1', 'a2', 'a3', 'a4', 'coach-a', 'obs-a1', 'obs-a2']))

  assert.equal(result.id, 'search-a')
  assert.deepEqual(created[0].data.starterUserIds, ['leader-a', 'a1', 'a2', 'a3', 'a4'])
  assert.equal(created[0].data.coachUserId, 'coach-a')
  assert.deepEqual(created[0].data.observerUserIds, ['obs-a1', 'obs-a2'])
})

test('createTeamScrimSearch allows offline bot starters when one real starter is online', async () => {
  const created: any[] = []
  ;(db as any).teamMember = {
    findFirst: async () => ({ role: 'OWNER' }),
    findMany: async () => activeMembersWithBots,
  }
  ;(db as any).scrimSearch = {
    findFirst: async () => null,
    create: async (args: any) => { created.push(args); return { id: 'search-bots', ...args.data } },
  }

  const result = await createTeamScrimSearch('leader-a', {
    teamId: 'team-a',
    starterUserIds: ['leader-a', 'bot-a1', 'bot-a2', 'bot-a3', 'bot-a4'],
  }, new Set(['leader-a']))

  assert.equal(result.id, 'search-bots')
  assert.deepEqual(created[0].data.starterUserIds, ['leader-a', 'bot-a1', 'bot-a2', 'bot-a3', 'bot-a4'])
})

test('createTeamScrimSearch rejects bot-only or offline-human starter rosters', async () => {
  ;(db as any).teamMember = {
    findFirst: async () => ({ role: 'OWNER' }),
    findMany: async () => activeMembersWithBots,
  }
  ;(db as any).scrimSearch = {
    findFirst: async () => null,
    create: async () => assert.fail('bot-only search should not be created'),
  }

  await assert.rejects(
    () => createTeamScrimSearch('leader-a', {
      teamId: 'team-a',
      starterUserIds: ['leader-a', 'bot-a1', 'bot-a2', 'bot-a3', 'bot-a4'],
    }, new Set()),
    (error) => {
      assert.ok(error instanceof AppError)
      assert.equal(error.statusCode, 422)
      assert.match(error.message, /titular real.*online/i)
      return true
    },
  )
})

test('listSelfServeScrimsForUser returns received invites and pending sent team invites', async () => {
  const pendingSentInvites = [
    { id: 'sent-1', status: 'PENDING', invitedUser: { id: 'u2', username: 'PlayerTwo', avatar: null } },
  ]
  const receivedInvites = [
    {
      id: 'received-1',
      status: 'PENDING',
      team: { id: 'other-team', name: 'Other Team', logoUrl: null },
      invitedBy: { id: 'captain-2', username: 'CaptainTwo', avatar: null },
    },
  ]

  ;(db as any).teamMember = {
    findFirst: async (args: any) => {
      assert.equal(args.where.userId, 'leader-a')
      assert.ok(args.include.team.include.invites, 'team include should expose pending sent invites')
      return {
        teamId: 'team-a',
        role: 'OWNER',
        team: {
          id: 'team-a',
          name: 'Storm Alpha',
          members: [],
          invites: pendingSentInvites,
        },
      }
    },
  }
  ;(db as any).scrimSearch = { findMany: async () => [] }
  ;(db as any).scrimChallenge = { findMany: async () => [] }
  ;(db as any).teamInvite = {
    findMany: async (args: any) => {
      assert.deepEqual(args.where, { invitedUserId: 'leader-a', status: 'PENDING' })
      return receivedInvites
    },
  }

  const result = await listSelfServeScrimsForUser('leader-a')

  assert.equal(result.myTeam?.id, 'team-a')
  assert.deepEqual(result.myTeam?.invites, pendingSentInvites)
  assert.deepEqual(result.myInvites, receivedInvites)
})

test('listSelfServeScrimsForUser requests only active team members for my team and catalog teams', async () => {
  const memberIncludeAssertions: any[] = []
  ;(db as any).teamMember = {
    findFirst: async (args: any) => {
      memberIncludeAssertions.push(args.include.team.include.members)
      return {
        teamId: 'team-a',
        role: 'OWNER',
        team: {
          id: 'team-a',
          name: 'Storm Alpha',
          members: [{ userId: 'leader-a', status: 'ACTIVE' }],
          invites: [],
        },
      }
    },
  }
  ;(db as any).scrimSearch = {
    findMany: async (args: any) => {
      memberIncludeAssertions.push(args.include.team.include.members)
      return []
    },
  }
  ;(db as any).scrimChallenge = { findMany: async () => [] }
  ;(db as any).teamInvite = { findMany: async () => [] }

  await listSelfServeScrimsForUser('leader-a')

  assert.deepEqual(memberIncludeAssertions.map((entry) => entry.where), [
    { status: 'ACTIVE' },
    { status: 'ACTIVE' },
  ])
})

test('acceptTeamScrimChallenge creates match players only for starters and access rows for staff', async () => {
  const teamAStarters = ['a1', 'a2', 'a3', 'a4', 'a5']
  const teamBStarters = ['b1', 'b2', 'b3', 'b4', 'b5']
  const matchCreates: any[] = []
  const accessCreates: any[] = []
  const redisWrites: any[] = []

  ;(db as any).teamMember = { findFirst: async () => ({ role: 'OWNER' }) }
  ;(db as any).scrimChallenge = {
    findFirst: async () => ({
      id: 'challenge-1',
      status: 'PENDING',
      fromTeamId: 'team-a',
      toTeamId: 'team-b',
      fromTeam: { id: 'team-a', name: 'Storm Alpha' },
      toTeam: { id: 'team-b', name: 'Nexus Beta' },
      fromSearch: { id: 'search-a', teamId: 'team-a', starterUserIds: teamAStarters, coachUserId: 'coach-a', observerUserIds: ['obs-a1'] },
      toSearch: { id: 'search-b', teamId: 'team-b', starterUserIds: teamBStarters, coachUserId: 'coach-b', observerUserIds: ['obs-b1', 'obs-b2'] },
    }),
    update: async (args: any) => ({ id: args.where.id, ...args.data }),
  }
  ;(db as any).user = { findMany: async () => [...teamAStarters, ...teamBStarters].map((id, index) => ({ id, mmr: 1400 + index })) }
  ;(db as any).match = {
    create: async (args: any) => {
      matchCreates.push(args)
      return {
        id: 'match-1',
        players: args.data.players.create.map((player: any, index: number) => ({ id: `mp-${index}`, ...player, user: { id: player.userId, username: player.userId, avatar: null, mmr: player.mmrBefore } })),
      }
    },
  }
  ;(db as any).scrimAccess = { createMany: async (args: any) => { accessCreates.push(args); return { count: args.data.length } } }
  ;(db as any).scrimSearch = { updateMany: async () => ({ count: 2 }) }
  ;(db as any).$transaction = async (fn: any) => fn(db)
  ;(redis as any).setex = async (key: string, ttl: number, value: string) => { redisWrites.push({ key, ttl, value }); return 'OK' }

  const result = await acceptTeamScrimChallenge('leader-b', 'challenge-1', new Set([...teamAStarters, ...teamBStarters]))

  assert.equal(result.matchId, 'match-1')
  assert.equal(matchCreates[0].data.players.create.length, 10)
  assert.deepEqual(matchCreates[0].data.players.create.map((player: any) => player.userId), [...teamAStarters, ...teamBStarters])
  assert.deepEqual(accessCreates[0].data.map((row: any) => ({ userId: row.userId, team: row.team, role: row.role })), [
    { userId: 'coach-a', team: 1, role: 'COACH' },
    { userId: 'obs-a1', team: 1, role: 'OBSERVER' },
    { userId: 'coach-b', team: 2, role: 'COACH' },
    { userId: 'obs-b1', team: 2, role: 'OBSERVER' },
    { userId: 'obs-b2', team: 2, role: 'OBSERVER' },
  ])
  assert.equal(redisWrites[0].key, REDIS_KEYS.pendingMatch('match-1'))
  assert.equal(JSON.parse(redisWrites[0].value).totalPlayers, 10)
})

test('acceptTeamScrimChallenge auto-accepts bot starters and requires only real starters online', async () => {
  const teamAStarters = ['a1', 'a-bot-1', 'a-bot-2', 'a-bot-3', 'a-bot-4']
  const teamBStarters = ['b1', 'b-bot-1', 'b-bot-2', 'b-bot-3', 'b-bot-4']
  const matchCreates: any[] = []
  const redisWrites: any[] = []
  const botIds = new Set([...teamAStarters, ...teamBStarters].filter((id) => id.includes('bot')))

  ;(db as any).teamMember = { findFirst: async () => ({ role: 'OWNER' }) }
  ;(db as any).scrimChallenge = {
    findFirst: async () => ({
      id: 'challenge-bots',
      status: 'PENDING',
      fromTeamId: 'team-a',
      toTeamId: 'team-b',
      fromTeam: { id: 'team-a', name: 'Storm Alpha' },
      toTeam: { id: 'team-b', name: 'Nexus Beta' },
      fromSearch: { id: 'search-a', teamId: 'team-a', starterUserIds: teamAStarters, coachUserId: null, observerUserIds: [] },
      toSearch: { id: 'search-b', teamId: 'team-b', starterUserIds: teamBStarters, coachUserId: null, observerUserIds: [] },
    }),
    update: async (args: any) => ({ id: args.where.id, ...args.data }),
  }
  ;(db as any).user = {
    findMany: async () => [...teamAStarters, ...teamBStarters].map((id, index) => ({
      id,
      username: id,
      mmr: 1400 + index,
      isBot: botIds.has(id),
    })),
  }
  ;(db as any).match = {
    create: async (args: any) => {
      matchCreates.push(args)
      return {
        id: 'match-bots',
        players: args.data.players.create.map((player: any, index: number) => ({
          id: `mp-${index}`,
          ...player,
          user: { id: player.userId, username: player.botName ?? player.userId, avatar: null, mmr: player.mmrBefore },
        })),
      }
    },
  }
  ;(db as any).scrimAccess = { createMany: async () => ({ count: 0 }) }
  ;(db as any).scrimSearch = { updateMany: async () => ({ count: 2 }) }
  ;(db as any).$transaction = async (fn: any) => fn(db)
  ;(redis as any).setex = async (key: string, ttl: number, value: string) => { redisWrites.push({ key, ttl, value }); return 'OK' }

  const result = await acceptTeamScrimChallenge('leader-b', 'challenge-bots', new Set(['a1', 'b1']))

  assert.equal(result.matchId, 'match-bots')
  assert.equal(matchCreates[0].data.players.create.length, 10)
  assert.equal(matchCreates[0].data.players.create.filter((player: any) => player.isBot).length, 8)
  assert.equal(matchCreates[0].data.players.create.filter((player: any) => player.accepted === true).length, 8)
  assert.equal(JSON.parse(redisWrites[0].value).totalPlayers, 2)
})
