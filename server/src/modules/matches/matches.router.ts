import { Router } from 'express'
import { z } from 'zod'
import { authenticate, AuthRequest } from '../../shared/middlewares/authenticate'
import { db } from '../../infrastructure/database/client'
import { castMvpVote, castVote, markPlayerReady, getRealtimeMatchMeta } from './matches.service'
import { Errors } from '../../shared/errors/AppError'
import { calculateRank } from '../users/player-progression'
import { getDiscordVoiceAccessForUser } from './discord-match-voice.service'

export const matchesRouter = Router()

matchesRouter.use(authenticate)

matchesRouter.get('/live', async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthRequest
    const matches = await db.match.findMany({
      where: { status: { in: ['VETOING', 'PLAYING', 'VOTING'] } },
      include: {
        players: {
          orderBy: [{ team: 'asc' }, { isCaptain: 'desc' }, { mmrBefore: 'desc' }],
          include: {
            user: {
              select: {
                id: true,
                username: true,
                avatar: true,
                mmr: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 12,
    })

    const enriched = await Promise.all(
      matches.map(async (match) => {
        const runtime = await getRealtimeMatchMeta(match.id)
        const humanPlayers = match.players.filter((player) => !player.isBot)
        const readyCount = runtime.ready?.readyBy.length ?? 0
        const viewerPlayer = match.players.find((player) => player.userId === authReq.userId)

        return {
          id: match.id,
          status: match.status,
          mode: match.mode,
          region: match.region,
          selectedMap: match.selectedMap,
          createdAt: match.createdAt,
          startedAt: match.startedAt,
          viewerTeam: viewerPlayer?.team ?? null,
          readyCount,
          totalPlayers: runtime.ready?.totalPlayers ?? humanPlayers.length,
          voteCounts: runtime.voteCounts,
          teams: {
            1: match.players
              .filter((player) => player.team === 1)
              .map((player) => ({
                userId: player.userId,
                username: player.user?.username ?? player.botName ?? 'TestBot',
                avatar: player.user?.avatar ?? null,
                mmr: player.user?.mmr ?? player.mmrBefore,
                isCaptain: player.isCaptain,
                isBot: player.isBot,
              })),
            2: match.players
              .filter((player) => player.team === 2)
              .map((player) => ({
                userId: player.userId,
                username: player.user?.username ?? player.botName ?? 'TestBot',
                avatar: player.user?.avatar ?? null,
                mmr: player.user?.mmr ?? player.mmrBefore,
                isCaptain: player.isCaptain,
                isBot: player.isBot,
              })),
          },
        }
      }),
    )

    res.json(enriched)
  } catch (err) {
    next(err)
  }
})

matchesRouter.get('/:matchId', async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthRequest
    const match = await db.match.findUnique({
      where: { id: req.params.matchId },
      include: {
        players: {
          include: {
            user: {
              select: {
                id: true,
                username: true,
                avatar: true,
                rank: true,
                mmr: true,
                wins: true,
                losses: true,
                matchPlayers: {
                  where: { match: { status: 'COMPLETED' } },
                  select: {
                    team: true,
                    match: { select: { winner: true, selectedMap: true, createdAt: true } },
                  },
                  orderBy: { match: { createdAt: 'desc' } },
                  take: 5,
                },
              },
            },
          },
        },
        vetoes: { orderBy: { order: 'asc' } },
        votes: { select: { userId: true, winner: true } },
      },
    })
    if (!match) throw Errors.NOT_FOUND('Match')
    const [runtime, mvpVotes, mvpRecord, discordVoice] = await Promise.all([
      getRealtimeMatchMeta(req.params.matchId),
      db.$queryRaw<Array<{ userId: string; nomineeUserId: string }>>`
        SELECT "userId", "nomineeUserId" FROM "MvpVote" WHERE "matchId" = ${req.params.matchId}
      `,
      db.$queryRaw<Array<{ mvpUserId: string | null }>>`
        SELECT "mvpUserId" FROM "Match" WHERE "id" = ${req.params.matchId}
      `,
      getDiscordVoiceAccessForUser(req.params.matchId, authReq.userId),
    ])
    res.json({
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
              winrate: player.user.wins + player.user.losses > 0
                ? Math.round((player.user.wins / (player.user.wins + player.user.losses)) * 100)
                : 0,
              recentMatches: (player.user.matchPlayers ?? []).map((mp) => ({
                won: mp.match.winner === mp.team,
                map: mp.match.selectedMap ?? null,
                date: mp.match.createdAt,
              })),
              matchPlayers: undefined, // no exponer la relación raw
            }
          : {
              id: player.userId ?? `bot:${player.id}`,
              username: player.botName ?? 'TestBot',
              avatar: null,
              mmr: player.mmrBefore,
              rank: calculateRank(player.mmrBefore),
              wins: 0,
              losses: 0,
              winrate: 0,
              recentMatches: [],
            },
      })),
    })
  } catch (err) {
    next(err)
  }
})

matchesRouter.post('/:matchId/ready', async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthRequest
    await markPlayerReady(req.params.matchId, authReq.userId)
    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})

matchesRouter.post('/:matchId/vote', async (req, res, next) => {
  try {
    const { winner } = z.object({ winner: z.union([z.literal(1), z.literal(2)]) }).parse(req.body)
    const authReq = req as unknown as AuthRequest
    await castVote(req.params.matchId, authReq.userId, winner)
    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})

matchesRouter.post('/:matchId/mvp-vote', async (req, res, next) => {
  try {
    const { nomineeUserId } = z.object({ nomineeUserId: z.string().min(1) }).parse(req.body)
    const authReq = req as unknown as AuthRequest
    await castMvpVote(req.params.matchId, authReq.userId, nomineeUserId)
    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})

matchesRouter.get('/:matchId/chat', async (req, res, next) => {
  try {
    const messages = await db.chatMessage.findMany({
      where: { matchId: req.params.matchId },
      orderBy: { createdAt: 'asc' },
      include: { user: { select: { username: true, avatar: true } } },
    })
    res.json(messages)
  } catch (err) {
    next(err)
  }
})
