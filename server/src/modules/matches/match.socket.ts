import { randomUUID } from 'crypto'
import { Server, Socket } from 'socket.io'
import { db } from '../../infrastructure/database/client'
import { performVeto } from '../matchmaking/matchmaking.service'
import { castMvpVote, castVote, finishMatch, getRealtimeMatchMeta, markPlayerReady, requestMatchCancellation } from './matches.service'
import { calculateRank } from '../users/player-progression'
import { getDiscordVoiceAccessForUser } from './discord-match-voice.service'
import { sanitizeMatchChatMessage } from './chat-policy'
import { listMatchReplayUploads } from './replay-processor.service'

export function registerMatchHandlers(io: Server, socket: Socket) {
  const userId = socket.data.userId as string

  // Join a match room
  socket.on('match:join', async ({ matchId }: { matchId: string }) => {
    const matchExists = await db.match.findUnique({
      where: { id: matchId },
      select: {
        id: true,
        players: {
          where: { userId },
          select: { team: true, isBot: true },
          take: 1,
        },
      },
    })

    if (!matchExists) {
      socket.emit('error', { code: 'MATCH_NOT_FOUND' })
      return
    }

    socket.join(`match:${matchId}`)
    const viewerTeam = matchExists.players[0]?.isBot ? null : matchExists.players[0]?.team ?? null
    if (viewerTeam === 1 || viewerTeam === 2) {
      socket.join(`match:${matchId}:team:${viewerTeam}`)
    }

    // Send full match state to the joining player
    const match = await db.match.findUnique({
      where: { id: matchId },
      include: {
        players: {
          include: { user: { select: { id: true, username: true, avatar: true, rank: true, mmr: true } } },
        },
        vetoes: { orderBy: { order: 'asc' } },
        votes: { select: { userId: true, winner: true } },

      },
    })
    const runtime = match ? await getRealtimeMatchMeta(matchId) : null
    const visibleMessages = match
      ? await db.$queryRaw<
          Array<{
            id: string
            userId: string
            username: string
            avatar: string | null
            content: string
            channel: string
            team: number | null
            createdAt: Date
          }>
        >`
          SELECT cm."id", cm."userId", u."username", u."avatar", cm."content",
                 COALESCE(cm."channel", 'GLOBAL') AS "channel", cm."team", cm."createdAt"
          FROM "ChatMessage" cm
          JOIN "User" u ON u."id" = cm."userId"
          WHERE cm."matchId" = ${matchId}
            AND (cm."channel" = 'GLOBAL' OR (cm."channel" = 'TEAM' AND cm."team" = ${viewerTeam}))
          ORDER BY cm."createdAt" ASC
          LIMIT 80
        `
      : []
    const [mvpVotes, mvpRecord, discordVoice, replayUploads] = match
      ? await Promise.all([
          db.$queryRaw<Array<{ userId: string; nomineeUserId: string }>>`
            SELECT "userId", "nomineeUserId" FROM "MvpVote" WHERE "matchId" = ${matchId}
          `,
          db.$queryRaw<Array<{ mvpUserId: string | null }>>`
            SELECT "mvpUserId" FROM "Match" WHERE "id" = ${matchId}
          `,
          getDiscordVoiceAccessForUser(matchId, userId),
          listMatchReplayUploads(matchId, 3),
        ])
      : [[], [], null, []]

    socket.emit('match:state', match
      ? {
          ...match,
          mvpUserId: mvpRecord[0]?.mvpUserId ?? null,
          mvpVotes,
          discordVoice,
          replayUploads,
          runtime,
          messages: visibleMessages.map((message) => ({
            id: message.id,
            userId: message.userId,
            username: message.username,
            avatar: message.avatar,
            content: message.content,
            channel: message.channel === 'TEAM' ? 'TEAM' : 'GLOBAL',
            team: message.team === 1 || message.team === 2 ? message.team : null,
            timestamp: message.createdAt,
          })),
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
  socket.on('chat:send', async ({ matchId, content, channel }: { matchId: string; content: string; channel?: 'GLOBAL' | 'TEAM' }) => {
    let sanitizedContent: string
    try {
      sanitizedContent = sanitizeMatchChatMessage(content)
    } catch (err) {
      socket.emit('error', { code: 'CHAT_REJECTED', message: (err as Error).message })
      return
    }

    const requestedChannel = channel === 'TEAM' ? 'TEAM' : 'GLOBAL'

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
    if (requestedChannel === 'TEAM' && (player.team !== 1 && player.team !== 2)) {
      socket.emit('error', { code: 'TEAM_CHAT_UNAVAILABLE', message: 'El chat de equipo requiere participar en un equipo.' })
      return
    }

    const team = requestedChannel === 'TEAM' ? player.team : null
    const messageId = randomUUID()
    const [message] = await db.$queryRaw<Array<{ id: string; content: string; channel: string; team: number | null; createdAt: Date }>>`
      INSERT INTO "ChatMessage" ("id", "matchId", "userId", "content", "channel", "team")
      VALUES (${messageId}, ${matchId}, ${userId}, ${sanitizedContent}, ${requestedChannel}, ${team})
      RETURNING "id", "content", "channel", "team", "createdAt"
    `

    const payload = {
      id: message.id,
      userId,
      username: player.user.username,
      avatar: player.user.avatar,
      content: message.content,
      channel: message.channel === 'TEAM' ? 'TEAM' : 'GLOBAL',
      team: message.team === 1 || message.team === 2 ? message.team : null,
      timestamp: message.createdAt,
    }

    if (requestedChannel === 'TEAM' && team) {
      io.to(`match:${matchId}:team:${team}`).emit('chat:message', payload)
      return
    }

    io.to(`match:${matchId}`).emit('chat:message', payload)
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
