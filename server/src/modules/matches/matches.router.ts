import { Router } from 'express'
import { z } from 'zod'
import { authenticate, AuthRequest } from '../../shared/middlewares/authenticate'
import { db } from '../../infrastructure/database/client'
import { castVote, markPlayerReady, getRealtimeMatchMeta } from './matches.service'
import { Errors } from '../../shared/errors/AppError'
import { calculateRank } from '../users/player-progression'

export const matchesRouter = Router()

matchesRouter.use(authenticate)

matchesRouter.get('/:matchId', async (req, res, next) => {
  try {
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
    const runtime = await getRealtimeMatchMeta(req.params.matchId)
    res.json({
      ...match,
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
