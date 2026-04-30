import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'
import { db } from '../../infrastructure/database/client'
import { AppError } from '../../shared/errors/AppError'
import {
  addTestBotsToTeam,
  createTeam,
  createTeamInvite,
  createTeamJoinRequest,
  removeTeamMember,
  respondToTeamInvite,
  respondToTeamJoinRequest,
} from './teams.service'

const original = {
  team: (db as any).team,
  teamMember: (db as any).teamMember,
  teamInvite: (db as any).teamInvite,
  teamJoinRequest: (db as any).teamJoinRequest,
  user: (db as any).user,
  transaction: (db as any).$transaction,
}

afterEach(() => {
  ;(db as any).team = original.team
  ;(db as any).teamMember = original.teamMember
  ;(db as any).teamInvite = original.teamInvite
  ;(db as any).teamJoinRequest = original.teamJoinRequest
  ;(db as any).user = original.user
  ;(db as any).$transaction = original.transaction
})

test('createTeam creates a team and owner membership when user has no active team', async () => {
  const calls: any[] = []
  ;(db as any).teamMember = { findFirst: async () => null }
  ;(db as any).team = {
    create: async (args: any) => {
      calls.push(args)
      return { id: 'team-1', name: 'Storm Alpha', slug: 'storm-alpha', members: [{ userId: 'user-1', role: 'OWNER' }] }
    },
  }

  const team = await createTeam('user-1', { name: 'Storm Alpha' })

  assert.equal(team.id, 'team-1')
  assert.equal(calls[0].data.ownerId, 'user-1')
  assert.equal(calls[0].data.slug, 'storm-alpha')
  assert.deepEqual(calls[0].data.members.create, { userId: 'user-1', role: 'OWNER', status: 'ACTIVE' })
})

test('createTeam rejects users that already belong to an active team', async () => {
  ;(db as any).teamMember = { findFirst: async () => ({ teamId: 'existing-team' }) }
  ;(db as any).team = { create: async () => assert.fail('team should not be created') }

  await assert.rejects(
    () => createTeam('user-1', { name: 'Storm Alpha' }),
    (error) => {
      assert.ok(error instanceof AppError)
      assert.equal(error.statusCode, 409)
      assert.match(error.message, /active team/i)
      return true
    },
  )
})

test('getMyTeam requests only active members so kicked users disappear from roster', async () => {
  const { getMyTeam } = await import('./teams.service')
  const memberIncludes: any[] = []
  ;(db as any).teamMember = {
    findFirst: async (args: any) => {
      memberIncludes.push(args.include.team.include.members)
      return { team: { id: 'team-1', members: [] } }
    },
  }

  await getMyTeam('owner-1')

  assert.deepEqual(memberIncludes[0].where, { status: 'ACTIVE' })
})

test('createTeamInvite requires owner or captain and blocks invitees with active team', async () => {
  ;(db as any).teamMember = {
    findFirst: async (args: any) => {
      if (args.where.userId === 'leader-1') return { role: 'MEMBER' }
      if (args.where.userId === 'invitee-1') return { teamId: 'other-team' }
      return null
    },
  }
  ;(db as any).teamInvite = { create: async () => assert.fail('invite should not be created') }

  await assert.rejects(
    () => createTeamInvite('leader-1', { teamId: 'team-1', invitedUserId: 'invitee-1' }),
    (error) => {
      assert.ok(error instanceof AppError)
      assert.equal(error.statusCode, 403)
      return true
    },
  )
})

test('createTeamInvite blocks duplicate pending invite for same team and user', async () => {
  ;(db as any).teamMember = {
    findFirst: async (args: any) => {
      if (args.where.userId === 'leader-1') return { role: 'OWNER' }
      return null
    },
  }
  ;(db as any).teamInvite = {
    findFirst: async () => ({ id: 'invite-1', status: 'PENDING' }),
    create: async () => assert.fail('duplicate invite should not be created'),
  }

  await assert.rejects(
    () => createTeamInvite('leader-1', { teamId: 'team-1', invitedUserId: 'invitee-1' }),
    (error) => {
      assert.ok(error instanceof AppError)
      assert.equal(error.statusCode, 409)
      assert.match(error.message, /invitación pendiente/i)
      return true
    },
  )
})

test('respondToTeamInvite accepts pending invite and creates active member', async () => {
  const createdMembers: any[] = []
  const updatedInvites: any[] = []
  ;(db as any).teamInvite = {
    findFirst: async () => ({ id: 'invite-1', teamId: 'team-1', invitedUserId: 'user-2', status: 'PENDING' }),
    update: async (args: any) => { updatedInvites.push(args); return { id: 'invite-1', status: 'ACCEPTED' } },
    updateMany: async () => ({ count: 0 }),
  }
  ;(db as any).teamMember = {
    findFirst: async () => null,
    create: async (args: any) => { createdMembers.push(args); return { id: 'member-1', ...args.data } },
  }
  ;(db as any).$transaction = async (fn: any) => fn(db)

  const result = await respondToTeamInvite('user-2', 'invite-1', 'ACCEPT')

  assert.equal(result.status, 'ACCEPTED')
  assert.deepEqual(createdMembers[0].data, { teamId: 'team-1', userId: 'user-2', role: 'MEMBER', status: 'ACTIVE' })
  assert.equal(updatedInvites[0].data.status, 'ACCEPTED')
})

test('respondToTeamInvite clears duplicate pending invites for same team and user after acceptance', async () => {
  const updatedMany: any[] = []
  const joinRequestUpdates: any[] = []
  ;(db as any).teamInvite = {
    findFirst: async () => ({ id: 'invite-1', teamId: 'team-1', invitedUserId: 'user-2', status: 'PENDING' }),
    update: async (args: any) => ({ id: args.where.id, status: args.data.status }),
    updateMany: async (args: any) => { updatedMany.push(args); return { count: 2 } },
  }
  ;(db as any).teamJoinRequest = {
    updateMany: async (args: any) => { joinRequestUpdates.push(args); return { count: 1 } },
  }
  ;(db as any).teamMember = {
    findFirst: async () => null,
    create: async (args: any) => ({ id: 'member-1', ...args.data }),
  }
  ;(db as any).$transaction = async (fn: any) => fn(db)

  const result = await respondToTeamInvite('user-2', 'invite-1', 'ACCEPT')

  assert.equal(result.status, 'ACCEPTED')
  assert.deepEqual(updatedMany[0].where, {
    invitedUserId: 'user-2',
    status: 'PENDING',
    NOT: { id: 'invite-1' },
  })
  assert.equal(updatedMany[0].data.status, 'EXPIRED')
  assert.ok(updatedMany[0].data.respondedAt instanceof Date)
  assert.deepEqual(joinRequestUpdates[0].where, { userId: 'user-2', status: 'PENDING' })
})

test('createTeamJoinRequest blocks duplicate pending requests for same team and user', async () => {
  ;(db as any).teamMember = { findFirst: async () => null }
  ;(db as any).team = { findFirst: async () => ({ id: 'team-1' }) }
  ;(db as any).teamInvite = { findFirst: async () => null }
  ;(db as any).teamJoinRequest = {
    findFirst: async () => ({ id: 'jr-1', status: 'PENDING' }),
    create: async () => assert.fail('duplicate request should not be created'),
  }

  await assert.rejects(
    () => createTeamJoinRequest('user-2', { teamId: 'team-1' }),
    (error) => {
      assert.ok(error instanceof AppError)
      assert.equal(error.statusCode, 409)
      return true
    },
  )
})

test('respondToTeamJoinRequest accepts request and expires other pending requests/invites', async () => {
  const joinRequestUpdates: any[] = []
  const inviteUpdates: any[] = []
  ;(db as any).teamJoinRequest = {
    findFirst: async () => ({ id: 'jr-1', teamId: 'team-1', userId: 'user-2', status: 'PENDING' }),
    update: async (args: any) => ({ id: args.where.id, status: args.data.status }),
    updateMany: async (args: any) => { joinRequestUpdates.push(args); return { count: 2 } },
  }
  ;(db as any).teamInvite = {
    updateMany: async (args: any) => { inviteUpdates.push(args); return { count: 1 } },
  }
  ;(db as any).teamMember = {
    findFirst: async (args: any) => {
      if (args.where.userId === 'owner-1') return { teamId: 'team-1', userId: 'owner-1', role: 'OWNER', status: 'ACTIVE' }
      return null
    },
    create: async (args: any) => ({ id: 'member-2', ...args.data }),
  }
  ;(db as any).$transaction = async (fn: any) => fn(db)

  const result = await respondToTeamJoinRequest('owner-1', 'jr-1', 'ACCEPT')

  assert.equal(result.status, 'ACCEPTED')
  assert.deepEqual(joinRequestUpdates[0].where, {
    userId: 'user-2',
    status: 'PENDING',
    NOT: { id: 'jr-1' },
  })
  assert.deepEqual(inviteUpdates[0].where, {
    invitedUserId: 'user-2',
    status: 'PENDING',
  })
})

test('assignTeamCompetitiveRole enforces single active captain per team', async () => {
  const { assignTeamCompetitiveRole } = await import('./teams.service')
  ;(db as any).teamMember = {
    findFirst: async (args: any) => {
      if (args.where.userId === 'owner-1') return { id: 'owner-member', teamId: 'team-1', userId: 'owner-1', role: 'OWNER', status: 'ACTIVE' }
      if (args.where.userId === 'member-2') return { id: 'member-2', teamId: 'team-1', userId: 'member-2', role: 'MEMBER', status: 'ACTIVE', competitiveRole: 'UNASSIGNED' }
      if (args.where.competitiveRole === 'CAPTAIN') return { id: 'captain-existing' }
      return null
    },
    count: async () => 0,
    update: async () => assert.fail('should not update when captain already exists'),
  }

  await assert.rejects(
    () => assignTeamCompetitiveRole('owner-1', 'team-1', 'member-2', 'CAPTAIN'),
    (error) => {
      assert.ok(error instanceof AppError)
      assert.equal(error.statusCode, 409)
      assert.match(error.message, /capitán/i)
      return true
    },
  )
})

test('assignTeamCompetitiveRole enforces maximum five starters', async () => {
  const { assignTeamCompetitiveRole } = await import('./teams.service')
  ;(db as any).teamMember = {
    findFirst: async (args: any) => {
      if (args.where.userId === 'owner-1') return { id: 'owner-member', teamId: 'team-1', userId: 'owner-1', role: 'OWNER', status: 'ACTIVE' }
      if (args.where.userId === 'member-3') return { id: 'member-3', teamId: 'team-1', userId: 'member-3', role: 'MEMBER', status: 'ACTIVE', competitiveRole: 'UNASSIGNED' }
      return null
    },
    count: async () => 5,
    update: async () => assert.fail('should not update when starter limit reached'),
  }

  await assert.rejects(
    () => assignTeamCompetitiveRole('owner-1', 'team-1', 'member-3', 'STARTER'),
    (error) => {
      assert.ok(error instanceof AppError)
      assert.equal(error.statusCode, 409)
      assert.match(error.message, /titulares/i)
      return true
    },
  )
})

test('removeTeamMember lets an owner kick a non-owner member', async () => {
  const updates: any[] = []
  ;(db as any).teamMember = {
    findFirst: async (args: any) => {
      if (args.where.userId === 'owner-1') return { id: 'member-owner', teamId: 'team-1', userId: 'owner-1', role: 'OWNER', status: 'ACTIVE' }
      if (args.where.userId === 'user-2') return { id: 'member-2', teamId: 'team-1', userId: 'user-2', role: 'MEMBER', status: 'ACTIVE' }
      return null
    },
    update: async (args: any) => { updates.push(args); return { id: args.where.id, ...args.data } },
  }

  const result = await removeTeamMember('owner-1', 'team-1', 'user-2')

  assert.equal(result.status, 'KICKED')
  assert.deepEqual(updates[0].where, { id: 'member-2' })
})

test('removeTeamMember blocks captains from kicking owners or captains', async () => {
  ;(db as any).teamMember = {
    findFirst: async (args: any) => {
      if (args.where.userId === 'captain-1') return { id: 'captain-member', teamId: 'team-1', userId: 'captain-1', role: 'CAPTAIN', status: 'ACTIVE' }
      if (args.where.userId === 'captain-2') return { id: 'target-captain', teamId: 'team-1', userId: 'captain-2', role: 'CAPTAIN', status: 'ACTIVE' }
      return null
    },
    update: async () => assert.fail('captain should not be kicked by another captain'),
  }

  await assert.rejects(
    () => removeTeamMember('captain-1', 'team-1', 'captain-2'),
    (error) => {
      assert.ok(error instanceof AppError)
      assert.equal(error.statusCode, 403)
      return true
    },
  )
})

test('addTestBotsToTeam creates enough bot users to complete a five-player roster', async () => {
  const createdUsers: any[] = []
  const createdMembers: any[] = []
  ;(db as any).team = {
    findUnique: async () => ({
      id: 'team-1',
      name: 'Storm Alpha',
      members: [
        { userId: 'owner-1', status: 'ACTIVE', user: { id: 'owner-1', isBot: false } },
        { userId: 'member-2', status: 'ACTIVE', user: { id: 'member-2', isBot: false } },
      ],
    }),
  }
  ;(db as any).user = {
    create: async (args: any) => {
      const user = { id: `bot-${createdUsers.length + 1}`, ...args.data }
      createdUsers.push(args)
      return user
    },
  }
  ;(db as any).teamMember = {
    create: async (args: any) => { createdMembers.push(args); return { id: `member-bot-${createdMembers.length + 1}`, ...args.data } },
  }
  ;(db as any).$transaction = async (fn: any) => fn(db)

  const result = await addTestBotsToTeam('team-1', { targetSize: 5 })

  assert.equal(result.addedCount, 3)
  assert.equal(result.activeCountAfter, 5)
  assert.equal(createdUsers.length, 3)
  assert.equal(result.bots[0].isBot, true)
  assert.equal(createdUsers[0].data.email.endsWith('@bots.local'), true)
  assert.deepEqual(createdMembers.map((entry) => entry.data.teamId), ['team-1', 'team-1', 'team-1'])
})
