import { Router } from 'express'
import { z } from 'zod'
import { authenticate, requireAdmin, AuthRequest } from '../../shared/middlewares/authenticate'
import { db } from '../../infrastructure/database/client'
import { Errors } from '../../shared/errors/AppError'
import { calculateRank } from '../users/player-progression'
import { redis, REDIS_KEYS } from '../../infrastructure/redis/client'
import { getIO } from '../../infrastructure/socket/server'
import { clearQueue, fillQueueWithBots } from '../matchmaking/matchmaking.service'

export const adminRouter = Router()

adminRouter.use(authenticate, requireAdmin)

async function clearMatchRuntimeState(matchId: string) {
  await Promise.all([
    redis.del(REDIS_KEYS.pendingMatch(matchId)),
    redis.del(REDIS_KEYS.matchReadyState(matchId)),
    redis.del(REDIS_KEYS.matchVotingState(matchId)),
    redis.del(REDIS_KEYS.matchFinishState(matchId)),
    redis.del(REDIS_KEYS.matchVetoState(matchId)),
    redis.del(REDIS_KEYS.matchCancelState(matchId)),
  ])
}

async function emitAdminMatchReset(matchId: string, players: Array<{ userId: string | null }>, reason: string) {
  const io = getIO()

  io.to(`match:${matchId}`).emit('match:cancelled', {
    reason,
    admin: true,
    matchId,
  })

  for (const player of players) {
    if (player.userId) {
      io.to(`user:${player.userId}`).emit('matchmaking:cancelled', {
        reason,
        admin: true,
        matchId,
      })
    }
  }
}

// ─── Users ────────────────────────────────────────────────

adminRouter.get('/users', async (req, res, next) => {
  try {
    const page = Number(req.query.page) || 1
    const limit = 20
    const search = req.query.search as string | undefined

    const users = await db.user.findMany({
      where: search
        ? { OR: [{ username: { contains: search, mode: 'insensitive' } }, { email: { contains: search, mode: 'insensitive' } }] }
        : undefined,
      select: {
        id: true, username: true, email: true, avatar: true,
        role: true, mmr: true, rank: true, wins: true, losses: true,
        isBanned: true, isSuspect: true,
        discordId: true, discordUsername: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: (page - 1) * limit,
    })

    const total = await db.user.count()
    res.json({
      users: users.map((user) => ({ ...user, rank: calculateRank(user.mmr) })),
      total,
      page,
      pages: Math.ceil(total / limit),
    })
  } catch (err) {
    next(err)
  }
})

adminRouter.patch('/users/:id/mmr', async (req, res, next) => {
  try {
    const { mmr } = z.object({ mmr: z.number().min(0).max(5000) }).parse(req.body)
    const rank = calculateRank(mmr)
    const user = await db.user.update({
      where: { id: req.params.id },
      data: { mmr, rank },
      select: { id: true, username: true, mmr: true, rank: true },
    })
    res.json({ ...user, rank: calculateRank(user.mmr) })
  } catch (err) {
    next(err)
  }
})

adminRouter.patch('/users/:id/ban', async (req, res, next) => {
  try {
    const { banned, reason } = z.object({
      banned: z.boolean(),
      reason: z.string().optional(),
    }).parse(req.body)

    const user = await db.user.update({
      where: { id: req.params.id },
      data: {
        isBanned: banned,
        role: banned ? 'BANNED' : 'USER',
        banReason: reason,
        bannedAt: banned ? new Date() : null,
      },
    })
    res.json({ ok: true, username: user.username, isBanned: user.isBanned })
  } catch (err) {
    next(err)
  }
})

adminRouter.patch('/users/:id/role', async (req, res, next) => {
  try {
    const { role } = z.object({ role: z.enum(['USER', 'MODERATOR', 'ADMIN', 'BANNED']) }).parse(req.body)
    const user = await db.user.update({
      where: { id: req.params.id },
      data: { role },
      select: { id: true, username: true, role: true },
    })
    res.json(user)
  } catch (err) {
    next(err)
  }
})

// ─── Matches ──────────────────────────────────────────────

adminRouter.get('/matches', async (req, res, next) => {
  try {
    const status = req.query.status as string | undefined
    const matches = await db.match.findMany({
      where: status ? { status: status as any } : undefined,
      include: {
        players: {
          include: { user: { select: { username: true } } },
          take: 10,
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    })
    res.json(matches)
  } catch (err) {
    next(err)
  }
})

adminRouter.patch('/matches/:id/cancel', async (req, res, next) => {
  try {
    const match = await db.match.findUnique({
      where: { id: req.params.id },
      include: {
        players: { select: { userId: true } },
      },
    })

    if (!match) throw Errors.NOT_FOUND('Match')
    if (match.status === 'COMPLETED') throw Errors.CONFLICT('Completed matches cannot be cancelled')

    await db.match.update({
      where: { id: match.id },
      data: {
        status: 'CANCELLED',
        endedAt: match.endedAt ?? new Date(),
      },
    })

    await clearMatchRuntimeState(match.id)
    await emitAdminMatchReset(match.id, match.players, 'Admin cancelled match')

    res.json({ ok: true, matchId: match.id, status: 'CANCELLED' })
  } catch (err) {
    next(err)
  }
})

adminRouter.delete('/matches/:id', async (req, res, next) => {
  try {
    const match = await db.match.findUnique({
      where: { id: req.params.id },
      include: {
        players: { select: { userId: true } },
      },
    })

    if (!match) throw Errors.NOT_FOUND('Match')

    await clearMatchRuntimeState(match.id)
    await emitAdminMatchReset(match.id, match.players, 'Admin deleted match')
    await db.match.delete({
      where: { id: match.id },
    })

    res.json({ ok: true, deletedMatchId: match.id })
  } catch (err) {
    next(err)
  }
})

// ─── Queue state ──────────────────────────────────────────

adminRouter.get('/queue', async (req, res, next) => {
  try {
    const queueKey = REDIS_KEYS.matchmakingQueue('SA')
    const entries = await redis.zrange(queueKey, 0, -1, 'WITHSCORES')

    const players = []
    for (let i = 0; i < entries.length; i += 2) {
      const userId = entries[i]
      const mmr = Number(entries[i + 1])
      const metaRaw = await redis.get(REDIS_KEYS.userInQueue(userId))
      const meta = JSON.parse(metaRaw || '{}')
      const isBot = Boolean(meta.isBot) || userId.startsWith('bot:')
      const user = isBot
        ? null
        : await db.user.findUnique({
            where: { id: userId },
            select: { username: true },
          })
      players.push({
        userId,
        mmr,
        username: isBot ? (meta.botName ?? 'TestBot') : user?.username,
        rank: calculateRank(mmr),
        isBot,
        ...meta,
      })
    }

    res.json({ count: players.length, players })
  } catch (err) {
    next(err)
  }
})

adminRouter.post('/queue/clear', async (_req, res, next) => {
  try {
    const result = await clearQueue('Admin cleared queue')
    res.json({ ok: true, ...result })
  } catch (err) {
    next(err)
  }
})

adminRouter.post('/queue/fill-bots', async (req, res, next) => {
  try {
    const { targetSize } = z.object({ targetSize: z.number().int().min(2).max(10).default(10) }).parse(req.body ?? {})
    const result = await fillQueueWithBots(targetSize)
    res.json({ ok: true, ...result })
  } catch (err) {
    next(err)
  }
})

adminRouter.get('/monitoring/client-errors', async (req, res, next) => {
  try {
    const limit = z.coerce.number().int().min(1).max(200).parse(req.query.limit ?? 50)
    const rows = await redis.lrange(REDIS_KEYS.clientErrorEvents(), 0, limit - 1)
    const events = rows.flatMap((row) => {
      try {
        return [JSON.parse(row)]
      } catch {
        return []
      }
    })
    res.json({ count: events.length, events })
  } catch (err) {
    next(err)
  }
})

// ─── Platform stats ───────────────────────────────────────

adminRouter.get('/stats', async (_req, res, next) => {
  try {
    const [totalUsers, activeMatches, completedMatches] = await Promise.all([
      db.user.count(),
      db.match.count({ where: { status: { in: ['ACCEPTING', 'VETOING', 'PLAYING', 'VOTING'] } } }),
      db.match.count({ where: { status: 'COMPLETED' } }),
    ])

    const queueSize = await redis.zcard(REDIS_KEYS.matchmakingQueue('SA'))

    res.json({ totalUsers, activeMatches, completedMatches, playersInQueue: queueSize })
  } catch (err) {
    next(err)
  }
})
