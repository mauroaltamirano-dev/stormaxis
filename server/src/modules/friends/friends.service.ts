import { db } from '../../infrastructure/database/client'
import { getIO, getOnlineUserIds } from '../../infrastructure/socket/server'
import { Errors } from '../../shared/errors/AppError'
import { presentPublicUser, publicUserSelect } from '../users/user.presenter'

export type FriendRequestResponse = 'ACCEPT' | 'DECLINE'
export type FriendStatus = 'SELF' | 'NONE' | 'FRIENDS' | 'OUTGOING' | 'INCOMING'

export type SendFriendRequestInput = {
  toUserId?: string
  username?: string
}

function friendDb() {
  return (db as any).friendRequest
}

function requireFriendDb() {
  const model = friendDb()
  if (!model) {
    throw Errors.VALIDATION(
      'Sistema de amistades no disponible todavía en este entorno. Ejecuta "npm run db:generate --workspace=server" y "npm run db:migrate --workspace=server", luego reinicia el backend.',
    )
  }
  return model
}

function now() {
  return new Date()
}

function emitFriendsUpdated(userIds: string[]) {
  try {
    const io = getIO()
    const payload = { version: 1, timestamp: Date.now() }
    for (const userId of [...new Set(userIds.filter(Boolean))]) {
      io.to(`user:${userId}`).emit('friends:updated', payload)
    }
  } catch {
    // Socket server may be unavailable in tests.
  }
}

function isBetweenUsers(request: any, userA: string, userB: string) {
  return (
    (request.fromUserId === userA && request.toUserId === userB) ||
    (request.fromUserId === userB && request.toUserId === userA)
  )
}

async function findUserByInput(input: SendFriendRequestInput) {
  if (input.toUserId) {
    return db.user.findUnique({ where: { id: input.toUserId }, select: publicUserSelect })
  }
  if (input.username) {
    return db.user.findUnique({ where: { username: input.username }, select: publicUserSelect })
  }
  return null
}

function mapRequestWithUser(request: any, viewerId: string) {
  const other = request.fromUserId === viewerId ? request.toUser : request.fromUser
  return {
    id: request.id,
    status: request.status,
    createdAt: request.createdAt,
    respondedAt: request.respondedAt ?? null,
    user: other ? presentPublicUser(other) : null,
  }
}

async function enrichFriendsPresence(friends: any[]) {
  const onlineUserIds = await getOnlineUserIds()
  const friendIds = friends.map((friend) => friend.id).filter(Boolean)
  const activePlayers = friendIds.length > 0
    ? await db.matchPlayer.findMany({
        where: {
          userId: { in: friendIds },
          match: { status: { in: ['ACCEPTING', 'VETOING', 'PLAYING', 'VOTING'] } },
        },
        select: { userId: true },
      })
    : []
  const inMatch = new Set(activePlayers.map((entry) => entry.userId))
  return friends.map((friend) => ({
    ...friend,
    presenceStatus: inMatch.has(friend.id) ? 'IN_MATCH' : onlineUserIds.has(friend.id) ? 'ONLINE' : 'OFFLINE',
  }))
}

export async function listMyFriends(userId: string) {
  const friendRequestModel = requireFriendDb()
  const [accepted, incoming, outgoing] = await Promise.all([
    friendRequestModel.findMany({
      where: {
        status: 'ACCEPTED',
        OR: [{ fromUserId: userId }, { toUserId: userId }],
      },
      include: {
        fromUser: { select: publicUserSelect },
        toUser: { select: publicUserSelect },
      },
      orderBy: { updatedAt: 'desc' },
    }),
    friendRequestModel.findMany({
      where: { toUserId: userId, status: 'PENDING' },
      include: { fromUser: { select: publicUserSelect }, toUser: { select: publicUserSelect } },
      orderBy: { createdAt: 'desc' },
    }),
    friendRequestModel.findMany({
      where: { fromUserId: userId, status: 'PENDING' },
      include: { fromUser: { select: publicUserSelect }, toUser: { select: publicUserSelect } },
      orderBy: { createdAt: 'desc' },
    }),
  ])

  const friends = accepted
      .map((request: any) => request.fromUserId === userId ? request.toUser : request.fromUser)
      .filter(Boolean)
      .map(presentPublicUser)

  return {
    friends: await enrichFriendsPresence(friends),
    incomingRequests: incoming.map((request: any) => mapRequestWithUser(request, userId)),
    outgoingRequests: outgoing.map((request: any) => mapRequestWithUser(request, userId)),
  }
}

export async function getFriendStatusByUsername(viewerId: string, username: string): Promise<{ status: FriendStatus; requestId: string | null; user: any }> {
  const target = await db.user.findUnique({ where: { username }, select: publicUserSelect })
  if (!target) throw Errors.NOT_FOUND('User')
  if (target.id === viewerId) return { status: 'SELF', requestId: null, user: presentPublicUser(target) }
  const friendRequestModel = requireFriendDb()

  const request = await friendRequestModel.findFirst({
    where: {
      OR: [
        { fromUserId: viewerId, toUserId: target.id, status: { in: ['PENDING', 'ACCEPTED'] } },
        { fromUserId: target.id, toUserId: viewerId, status: { in: ['PENDING', 'ACCEPTED'] } },
      ],
    },
    orderBy: { updatedAt: 'desc' },
  })

  if (!request) return { status: 'NONE', requestId: null, user: presentPublicUser(target) }
  if (request.status === 'ACCEPTED') return { status: 'FRIENDS', requestId: request.id, user: presentPublicUser(target) }
  if (request.fromUserId === viewerId) return { status: 'OUTGOING', requestId: request.id, user: presentPublicUser(target) }
  return { status: 'INCOMING', requestId: request.id, user: presentPublicUser(target) }
}

export async function sendFriendRequest(actorId: string, input: SendFriendRequestInput) {
  if (input.toUserId === actorId) throw Errors.CONFLICT('No puedes enviarte solicitud a ti mismo')
  const target = await findUserByInput(input)
  if (!target) throw Errors.NOT_FOUND('User')
  if (target.id === actorId) throw Errors.CONFLICT('No puedes enviarte solicitud a ti mismo')
  const friendRequestModel = requireFriendDb()

  const existing = await friendRequestModel.findFirst({
    where: {
      OR: [
        { fromUserId: actorId, toUserId: target.id, status: { in: ['PENDING', 'ACCEPTED'] } },
        { fromUserId: target.id, toUserId: actorId, status: { in: ['PENDING', 'ACCEPTED'] } },
      ],
    },
    orderBy: { updatedAt: 'desc' },
  })

  if (existing?.status === 'ACCEPTED') throw Errors.CONFLICT('Ya son amigos')
  if (existing?.status === 'PENDING' && existing.fromUserId === actorId) throw Errors.CONFLICT('Ya existe una solicitud pendiente')
  if (existing?.status === 'PENDING' && existing.toUserId === actorId) {
    const accepted = await friendRequestModel.update({
      where: { id: existing.id },
      data: { status: 'ACCEPTED', respondedAt: now() },
    })
    emitFriendsUpdated([actorId, target.id])
    return accepted
  }

  const created = await friendRequestModel.create({
    data: {
      fromUserId: actorId,
      toUserId: target.id,
      status: 'PENDING',
    },
  })
  emitFriendsUpdated([actorId, target.id])
  return created
}

export async function respondToFriendRequest(actorId: string, requestId: string, response: FriendRequestResponse) {
  const friendRequestModel = requireFriendDb()
  const request = await friendRequestModel.findFirst({
    where: { id: requestId, toUserId: actorId, status: 'PENDING' },
  })
  if (!request) throw Errors.NOT_FOUND('Friend request')
  const updated = await friendRequestModel.update({
    where: { id: requestId },
    data: {
      status: response === 'ACCEPT' ? 'ACCEPTED' : 'DECLINED',
      respondedAt: now(),
    },
  })
  emitFriendsUpdated([request.fromUserId, request.toUserId])
  return updated
}

export async function cancelFriendRequest(actorId: string, requestId: string) {
  const friendRequestModel = requireFriendDb()
  const request = await friendRequestModel.findFirst({
    where: { id: requestId, fromUserId: actorId, status: 'PENDING' },
  })
  if (!request) throw Errors.NOT_FOUND('Friend request')
  const updated = await friendRequestModel.update({
    where: { id: requestId },
    data: { status: 'CANCELLED', respondedAt: now() },
  })
  emitFriendsUpdated([request.fromUserId, request.toUserId])
  return updated
}

export async function removeFriend(actorId: string, friendUserId: string) {
  const friendRequestModel = requireFriendDb()
  if (actorId === friendUserId) throw Errors.CONFLICT('No puedes eliminarte a ti mismo')
  const request = await friendRequestModel.findFirst({
    where: {
      status: 'ACCEPTED',
      OR: [
        { fromUserId: actorId, toUserId: friendUserId },
        { fromUserId: friendUserId, toUserId: actorId },
      ],
    },
  })
  if (!request || !isBetweenUsers(request, actorId, friendUserId)) throw Errors.NOT_FOUND('Friendship')
  const updated = await friendRequestModel.update({
    where: { id: request.id },
    data: { status: 'REMOVED', respondedAt: now() },
  })
  emitFriendsUpdated([actorId, friendUserId])
  return updated
}
