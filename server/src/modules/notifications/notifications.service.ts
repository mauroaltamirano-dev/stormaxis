import { db } from '../../infrastructure/database/client'
import { publicUserSelect, presentPublicUser } from '../users/user.presenter'
import { listIncomingTeamJoinRequests, listMyTeamInvites } from '../teams/teams.service'

export type NotificationItem =
  | {
      id: string
      type: 'FRIEND_REQUEST'
      createdAt: Date
      fromUser: ReturnType<typeof presentPublicUser>
      friendRequestId: string
    }
  | {
      id: string
      type: 'TEAM_INVITE'
      createdAt: Date
      team: { id: string; name: string; slug: string; logoUrl: string | null }
      invitedBy?: { id: string; username: string; avatar: string | null } | null
      inviteId: string
    }
  | {
      id: string
      type: 'TEAM_JOIN_REQUEST'
      createdAt: Date
      team: { id: string; name: string; slug: string; logoUrl: string | null }
      user: { id: string; username: string; avatar: string | null; mmr: number; rank?: string | null }
      joinRequestId: string
    }

function getFriendRequestModel() {
  return (db as any).friendRequest ?? null
}

export async function listNotifications(userId: string) {
  const friendRequestModel = getFriendRequestModel()
  const [friendRequests, teamInvites, teamJoinRequests] = await Promise.all([
    friendRequestModel
      ? friendRequestModel.findMany({
          where: { toUserId: userId, status: 'PENDING' },
          include: { fromUser: { select: publicUserSelect } },
          orderBy: { createdAt: 'desc' },
          take: 20,
        })
      : Promise.resolve([]),
    listMyTeamInvites(userId),
    listIncomingTeamJoinRequests(userId),
  ])

  const items: NotificationItem[] = [
    ...friendRequests.map((request: any) => ({
      id: `friend:${request.id}`,
      type: 'FRIEND_REQUEST' as const,
      createdAt: request.createdAt,
      fromUser: presentPublicUser(request.fromUser),
      friendRequestId: request.id,
    })),
    ...teamInvites.map((invite: any) => ({
      id: `team-invite:${invite.id}`,
      type: 'TEAM_INVITE' as const,
      createdAt: invite.createdAt,
      team: {
        id: invite.team.id,
        name: invite.team.name,
        slug: invite.team.slug,
        logoUrl: invite.team.logoUrl ?? null,
      },
      invitedBy: invite.invitedBy ?? null,
      inviteId: invite.id,
    })),
    ...teamJoinRequests.map((request: any) => ({
      id: `team-join:${request.id}`,
      type: 'TEAM_JOIN_REQUEST' as const,
      createdAt: request.createdAt,
      team: request.team,
      user: request.user,
      joinRequestId: request.id,
    })),
  ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

  return { unreadCount: items.length, items }
}
