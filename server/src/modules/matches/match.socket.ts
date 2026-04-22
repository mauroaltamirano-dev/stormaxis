import { Server, Socket } from 'socket.io'
import { db } from '../../infrastructure/database/client'
import { performVeto } from '../matchmaking/matchmaking.service'
import { castMvpVote, castVote, finishMatch, getRealtimeMatchMeta, markPlayerReady, requestMatchCancellation } from './matches.service'
import { calculateRank } from '../users/player-progression'
import { getDiscordVoiceAccessForUser } from './discord-match-voice.service'

export function registerMatchHandlers(io: Server, socket: Socket) {
  const userId = socket.data.userId as string

  // Join a match room
  socket.on('match:join', async ({ matchId }: { matchId: string }) => {
    const matchExists = await db.match.findUnique({
      where: { id: matchId },
      select: { id: true },
    })

    if (!matchExists) {
      socket.emit('error', { code: 'MATCH_NOT_FOUND' })
      return
    }

    socket.join(`match:${matchId}`)

    // Send full match state to the joining player
    const match = await db.match.findUnique({
      where: { id: matchId },
      include: {
        players: {
          include: { user: { select: { id: true, username: true, avatar: true, rank: true, mmr: true } } },
        },
        vetoes: { orderBy: { order: 'asc' } },
        votes: { select: { userId: true, winner: true } },
        messages: { orderBy: { createdAt: 'asc' }, take: 50, include: { user: { select: { username: true, avatar: true } } } },
      },
    })
    const runtime = match ? await getRealtimeMatchMeta(matchId) : null
    const [mvpVotes, mvpRecord, discordVoice] = match
      ? await Promise.all([
          db.$queryRaw<Array<{ userId: string; nomineeUserId: string }>>`
            SELECT "userId", "nomineeUserId" FROM "MvpVote" WHERE "matchId" = ${matchId}
          `,
          db.$queryRaw<Array<{ mvpUserId: string | null }>>`
            SELECT "mvpUserId" FROM "Match" WHERE "id" = ${matchId}
          `,
          getDiscordVoiceAccessForUser(matchId, userId),
        ])
      : [[], [], null]

    socket.emit('match:state', match
      ? {
          ...match,
          mvpUserId: mvpRecord[0]?.mvpUserId ?? null,
          mvpVotes,
          discordVoice,
          runtime,
          players: match.players.map((player) => ({
            ...player,
            user: player.user
              ? {
                  ...player.user,
                  rank: calculateRank(player.user.mmr),
                }
              : {
                  id: player.userId ?? `bot:${player.id}`,
                  username: player.botName ?? 'TestBot',
                  avatar: null,
                  mmr: player.mmrBefore,
                  rank: calculateRank(player.mmrBefore),
                },
          })),
        }
      : null)
  })

  socket.on('match:ready', async ({ matchId }: { matchId: string }) => {
    try {
      await markPlayerReady(matchId, userId)
      socket.emit('match:ready:ok', { matchId })
    } catch (err) {
      socket.emit('error', { code: 'READY_FAILED', message: (err as Error).message })
    }
  })

  socket.on('match:finish', async ({ matchId }: { matchId: string }) => {
    try {
      await finishMatch(matchId, userId)
      socket.emit('match:finish:ok', { matchId })
    } catch (err) {
      socket.emit('error', { code: 'FINISH_FAILED', message: (err as Error).message })
    }
  })

  socket.on('match:cancel_request', async ({ matchId }: { matchId: string }) => {
    try {
      await requestMatchCancellation(matchId, userId)
      socket.emit('match:cancel_request:ok', { matchId })
    } catch (err) {
      socket.emit('error', { code: 'MATCH_CANCEL_FAILED', message: (err as Error).message })
    }
  })

  // Veto action
  socket.on('veto:ban', async ({ matchId, mapId }: { matchId: string; mapId: string }) => {
    try {
      await performVeto(matchId, mapId, userId)
    } catch (err) {
      socket.emit('error', { code: 'VETO_FAILED', message: (err as Error).message })
    }
  })

  // Chat message
  socket.on('chat:send', async ({ matchId, content }: { matchId: string; content: string }) => {
    if (!content?.trim() || content.length > 500) return

    const match = await db.match.findUnique({
      where: { id: matchId },
      select: { status: true },
    })
    const chatEnabledStatuses = new Set(['ACCEPTING', 'VETOING', 'PLAYING', 'VOTING'])
    if (!match || !chatEnabledStatuses.has(match.status)) {
      socket.emit('error', { code: 'CHAT_DISABLED', message: 'El chat solo está disponible durante un match activo.' })
      return
    }

    const player = await db.matchPlayer.findUnique({
      where: { matchId_userId: { matchId, userId } },
      include: { user: { select: { username: true, avatar: true } } },
    })

    if (!player?.user) return

    const message = await db.chatMessage.create({
      data: { matchId, userId, content: content.trim() },
    })

    io.to(`match:${matchId}`).emit('chat:message', {
      id: message.id,
      userId,
      username: player.user.username,
      avatar: player.user.avatar,
      content: message.content,
      timestamp: message.createdAt,
    })
  })

  // Vote for winner
  socket.on('vote:cast', async ({ matchId, winner }: { matchId: string; winner: 1 | 2 }) => {
    try {
      await castVote(matchId, userId, winner)
    } catch (err) {
      socket.emit('error', { code: 'VOTE_FAILED', message: (err as Error).message })
    }
  })

  socket.on('mvp:cast', async ({ matchId, nomineeUserId }: { matchId: string; nomineeUserId: string }) => {
    try {
      await castMvpVote(matchId, userId, nomineeUserId)
    } catch (err) {
      socket.emit('error', { code: 'MVP_VOTE_FAILED', message: (err as Error).message })
    }
  })
}
