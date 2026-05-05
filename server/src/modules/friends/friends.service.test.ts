import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'
import { db } from '../../infrastructure/database/client'
import { AppError } from '../../shared/errors/AppError'
import {
  cancelFriendRequest,
  getFriendStatusByUsername,
  listMyFriends,
  removeFriend,
  respondToFriendRequest,
  sendFriendRequest,
} from './friends.service'

const original = {
  friendRequest: (db as any).friendRequest,
  user: db.user,
}

afterEach(() => {
  ;(db as any).friendRequest = original.friendRequest
  ;(db as any).user = original.user
})

function mockFriendDb(options: {
  targetUser?: any
  existingRequests?: any[]
  createdRequest?: any
  requestForResponse?: any
  acceptedFriends?: any[]
} = {}) {
  const updates: any[] = []
  const creates: any[] = []
  ;(db as any).user = {
    findUnique: async () => options.targetUser ?? { id: 'user-2', username: 'Beta', avatar: null, mmr: 1300, rank: 'LVL_7' },
  }
  ;(db as any).friendRequest = {
    findFirst: async (args: any) => {
      if (args.where?.id) return options.requestForResponse ?? null
      return options.existingRequests?.[0] ?? null
    },
    findMany: async (args: any) => {
      if (args.where?.status === 'ACCEPTED') return options.acceptedFriends ?? []
      return options.existingRequests ?? []
    },
    create: async (args: any) => {
      creates.push(args)
      return options.createdRequest ?? { id: 'friend-request-1', ...args.data }
    },
    update: async (args: any) => {
      updates.push(args)
      return { id: args.where.id, ...options.requestForResponse, ...args.data }
    },
  }
  return { creates, updates }
}

test('sendFriendRequest creates pending request when no relationship exists', async () => {
  const { creates } = mockFriendDb()

  const result = await sendFriendRequest('user-1', { toUserId: 'user-2' })

  assert.equal(result.status, 'PENDING')
  assert.deepEqual(creates[0].data, { fromUserId: 'user-1', toUserId: 'user-2', status: 'PENDING' })
})

test('sendFriendRequest blocks self requests and duplicate pending outgoing requests', async () => {
  await assert.rejects(
    () => sendFriendRequest('user-1', { toUserId: 'user-1' }),
    (error) => error instanceof AppError && error.statusCode === 409,
  )

  mockFriendDb({ existingRequests: [{ id: 'req-1', fromUserId: 'user-1', toUserId: 'user-2', status: 'PENDING' }] })
  await assert.rejects(
    () => sendFriendRequest('user-1', { toUserId: 'user-2' }),
    (error) => error instanceof AppError && error.message === 'Ya existe una solicitud pendiente',
  )
})

test('sendFriendRequest accepts inverse pending request instead of duplicating', async () => {
  const { updates, creates } = mockFriendDb({
    existingRequests: [{ id: 'req-in', fromUserId: 'user-2', toUserId: 'user-1', status: 'PENDING' }],
  })

  const result = await sendFriendRequest('user-1', { toUserId: 'user-2' })

  assert.equal(result.status, 'ACCEPTED')
  assert.equal(updates[0].where.id, 'req-in')
  assert.equal(updates[0].data.status, 'ACCEPTED')
  assert.equal(creates.length, 0)
})

test('respondToFriendRequest accepts or declines only incoming pending requests', async () => {
  const { updates } = mockFriendDb({
    requestForResponse: { id: 'req-1', fromUserId: 'user-2', toUserId: 'user-1', status: 'PENDING' },
  })

  const accepted = await respondToFriendRequest('user-1', 'req-1', 'ACCEPT')
  assert.equal(accepted.status, 'ACCEPTED')
  assert.equal(updates[0].data.status, 'ACCEPTED')

  await respondToFriendRequest('user-1', 'req-1', 'DECLINE')
  assert.equal(updates[1].data.status, 'DECLINED')
})

test('cancelFriendRequest and removeFriend update request lifecycle', async () => {
  const { updates } = mockFriendDb({
    requestForResponse: { id: 'req-1', fromUserId: 'user-1', toUserId: 'user-2', status: 'PENDING' },
    existingRequests: [{ id: 'accepted-1', fromUserId: 'user-2', toUserId: 'user-1', status: 'ACCEPTED' }],
  })

  await cancelFriendRequest('user-1', 'req-1')
  assert.equal(updates[0].data.status, 'CANCELLED')

  await removeFriend('user-1', 'user-2')
  assert.equal(updates[1].data.status, 'REMOVED')
})

test('listMyFriends returns mutual accepted friends and pending requests', async () => {
  mockFriendDb({
    acceptedFriends: [{ id: 'accepted-1', fromUserId: 'user-2', toUserId: 'user-1', fromUser: { id: 'user-2', username: 'Beta' }, toUser: { id: 'user-1', username: 'Alpha' } }],
    existingRequests: [{ id: 'pending-1', fromUserId: 'user-1', toUserId: 'user-3', status: 'PENDING', toUser: { id: 'user-3', username: 'Gamma' } }],
  })

  const result = await listMyFriends('user-1')

  assert.deepEqual(result.friends.map((friend: { id: string }) => friend.id), ['user-2'])
  assert.equal(result.outgoingRequests.length, 1)
})

test('getFriendStatusByUsername reports self, none, outgoing, incoming, and friends', async () => {
  mockFriendDb({ targetUser: { id: 'user-1', username: 'Alpha' } })
  assert.equal((await getFriendStatusByUsername('user-1', 'Alpha')).status, 'SELF')

  mockFriendDb({ existingRequests: [{ id: 'req-1', fromUserId: 'user-1', toUserId: 'user-2', status: 'PENDING' }] })
  assert.equal((await getFriendStatusByUsername('user-1', 'Beta')).status, 'OUTGOING')

  mockFriendDb({ existingRequests: [{ id: 'req-2', fromUserId: 'user-2', toUserId: 'user-1', status: 'ACCEPTED' }] })
  assert.equal((await getFriendStatusByUsername('user-1', 'Beta')).status, 'FRIENDS')
})
