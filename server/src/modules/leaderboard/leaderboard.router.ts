import { Router } from 'express'
import { db } from '../../infrastructure/database/client'
import { calculateRank, getLevelInfo } from '../users/player-progression'

export const leaderboardRouter = Router()

leaderboardRouter.get('/', async (_req, res, next) => {
  try {
    const players = await db.user.findMany({
      where: { isBanned: false },
      select: {
        id: true, username: true, avatar: true,
        mmr: true, rank: true, wins: true, losses: true, countryCode: true,
      },
      orderBy: { mmr: 'desc' },
      take: 100,
    })
    res.json(players.map((player) => {
      const level = getLevelInfo(player.mmr)
      return {
        ...player,
        rank: calculateRank(player.mmr),
        level: level.level,
        levelProgressPct: level.progressPct,
      }
    }))
  } catch (err) {
    next(err)
  }
})
