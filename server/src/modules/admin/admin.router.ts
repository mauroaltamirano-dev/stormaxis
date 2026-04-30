import { Prisma } from '@prisma/client'
import { randomUUID } from 'crypto'
import { Router } from 'express'
import { z } from 'zod'
import { authenticate, requireAdmin, AuthRequest } from '../../shared/middlewares/authenticate'
import { db } from '../../infrastructure/database/client'
import { Errors } from '../../shared/errors/AppError'
import { calculateRank } from '../users/player-progression'
import { redis, REDIS_KEYS } from '../../infrastructure/redis/client'
import { getIO } from '../../infrastructure/socket/server'
import { clearQueue, fillQueueWithBots, getMatchmakingAdminMetrics } from '../matchmaking/matchmaking.service'
import { attachScrimDetailsToMatches, createAdminScrim, listAdminScrims } from '../scrims/scrims.service'
import { addTestBotsToTeam } from '../teams/teams.service'

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

type AdminAuditPayload = {
  actorId?: string | null
  targetUserId?: string | null
  action: string
  entityType: string
  entityId?: string | null
  summary: string
  metadata?: Prisma.InputJsonValue
}

type AuditSqlExecutor = {
  $executeRaw: typeof db.$executeRaw
}

function isMissingAdminAuditLogRelation(err: unknown) {
  const candidate = err as { code?: string; meta?: { code?: string; message?: string }; message?: string }

  return (
    candidate.code === 'P2021' ||
    candidate.meta?.code === '42P01' ||
    candidate.meta?.message?.includes('relation "AdminAuditLog" does not exist') ||
    candidate.message?.includes('relation "AdminAuditLog" does not exist')
  )
}

type SuspicionSeverity = 'low' | 'medium' | 'high'
type SuspicionLevel = 'clear' | 'watch' | 'suspicious' | 'critical'

type SuspicionSignal = {
  code: string
  label: string
  detail: string
  severity: SuspicionSeverity
  score: number
}

type SuspicionUserRecord = {
  createdAt: Date
  discordCreatedAt: Date | null
  discordId: string | null
  googleId: string | null
  bnetId: string | null
  isSuspect: boolean
  isBanned: boolean
  mmr: number
  wins: number
  losses: number
}

async function recordAdminAudit(executor: AuditSqlExecutor, payload: AdminAuditPayload) {
  const metadataJson = payload.metadata == null ? null : JSON.stringify(payload.metadata)
  const metadataValue = metadataJson == null ? Prisma.sql`NULL` : Prisma.sql`${metadataJson}::jsonb`

  try {
    await executor.$executeRaw(Prisma.sql`
      INSERT INTO "AdminAuditLog" (
        "id",
        "actorId",
        "targetUserId",
        "action",
        "entityType",
        "entityId",
        "summary",
        "metadata"
      )
      VALUES (
        ${randomUUID()},
        ${payload.actorId ?? null},
        ${payload.targetUserId ?? null},
        ${payload.action},
        ${payload.entityType},
        ${payload.entityId ?? null},
        ${payload.summary.slice(0, 280)},
        ${metadataValue}
      )
    `)
  } catch (err) {
    if (isMissingAdminAuditLogRelation(err)) return
    throw err
  }
}

function daysSince(value: Date | null) {
  if (!value) return null
  return Math.max(0, Math.floor((Date.now() - value.getTime()) / (24 * 60 * 60 * 1000)))
}

function getSuspicionLevel(score: number): SuspicionLevel {
  if (score >= 85) return 'critical'
  if (score >= 55) return 'suspicious'
  if (score >= 25) return 'watch'
  return 'clear'
}

function calculateSuspicion(user: SuspicionUserRecord) {
  const signals: SuspicionSignal[] = []
  const platformAgeDays = daysSince(user.createdAt)
  const discordAgeDays = daysSince(user.discordCreatedAt)
  const games = user.wins + user.losses
  const winrate = games > 0 ? Math.round((user.wins / games) * 100) : 0
  const mmrDelta = user.mmr - 1200
  const mmrDeltaPerGame = games > 0 ? Math.round(mmrDelta / games) : 0
  const linkedProviders = [user.discordId, user.googleId, user.bnetId].filter(Boolean).length

  if (user.isBanned) {
    signals.push({
      code: 'BANNED_ACCOUNT',
      label: 'Cuenta baneada',
      detail: 'Ya fue removida de la actividad competitiva.',
      severity: 'high',
      score: 80,
    })
  }

  if (user.isSuspect) {
    signals.push({
      code: 'MANUAL_OR_OAUTH_FLAG',
      label: 'Flag persistente',
      detail: 'Marcada manualmente o por OAuth como cuenta sospechosa.',
      severity: 'high',
      score: 45,
    })
  }

  if (discordAgeDays != null && discordAgeDays < 14) {
    signals.push({
      code: 'VERY_NEW_DISCORD',
      label: 'Discord muy nuevo',
      detail: `Cuenta Discord de ${discordAgeDays} días.`,
      severity: 'high',
      score: 35,
    })
  } else if (discordAgeDays != null && discordAgeDays < 60) {
    signals.push({
      code: 'NEW_DISCORD',
      label: 'Discord reciente',
      detail: `Cuenta Discord de ${discordAgeDays} días.`,
      severity: 'medium',
      score: 20,
    })
  }

  if (platformAgeDays != null && platformAgeDays < 7 && user.mmr >= 1450) {
    signals.push({
      code: 'NEW_HIGH_MMR',
      label: 'Alta nueva con ELO alto',
      detail: `Alta hace ${platformAgeDays} días y ya está en ${user.mmr} ELO.`,
      severity: 'medium',
      score: 25,
    })
  }

  if (games >= 5 && games <= 20 && winrate >= 75) {
    signals.push({
      code: 'EARLY_HIGH_WINRATE',
      label: 'Winrate inicial anormal',
      detail: `${winrate}% WR en ${games} partidas.`,
      severity: 'high',
      score: 30,
    })
  } else if (games >= 5 && games <= 25 && winrate >= 65) {
    signals.push({
      code: 'EARLY_STRONG_WINRATE',
      label: 'Winrate inicial fuerte',
      detail: `${winrate}% WR en ${games} partidas.`,
      severity: 'medium',
      score: 18,
    })
  }

  if (games >= 4 && games <= 20 && user.mmr >= 1400 && mmrDeltaPerGame >= 30) {
    signals.push({
      code: 'FAST_MMR_CLIMB',
      label: 'Subida de ELO acelerada',
      detail: `+${mmrDelta} ELO en ${games} partidas (~${mmrDeltaPerGame}/partida).`,
      severity: 'medium',
      score: 25,
    })
  }

  if (linkedProviders === 0 && games >= 3) {
    signals.push({
      code: 'NO_LINKED_PROVIDER_ACTIVITY',
      label: 'Sin identidad externa',
      detail: 'Tiene actividad competitiva sin Discord/Battle.net/Google vinculado.',
      severity: 'low',
      score: 15,
    })
  }

  const score = Math.min(100, signals.reduce((total, signal) => total + signal.score, 0))
  const level = getSuspicionLevel(score)

  return {
    suspicionScore: score,
    suspicionLevel: level,
    suspicionSignals: signals.map(({ score: _score, ...signal }) => signal),
    isComputedSuspicious: level === 'suspicious' || level === 'critical',
  }
}

// ─── Users ────────────────────────────────────────────────

adminRouter.get('/users', async (req, res, next) => {
  try {
    const page = z.coerce.number().int().min(1).parse(req.query.page ?? 1)
    const limit = 20
    const search = req.query.search as string | undefined
    const filter = z.enum(['all', 'suspicious', 'banned', 'clean']).catch('all').parse(req.query.filter ?? 'all')

    const where = search
      ? { OR: [{ username: { contains: search, mode: 'insensitive' as const } }, { email: { contains: search, mode: 'insensitive' as const } }] }
      : undefined

    const candidateUsers = await db.user.findMany({
      where,
      select: {
        id: true, username: true, email: true, avatar: true,
        role: true, mmr: true, rank: true, wins: true, losses: true,
        isBanned: true, isSuspect: true,
        discordId: true, discordUsername: true, discordCreatedAt: true,
        googleId: true, bnetId: true, bnetBattletag: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 500,
    })

    const enrichedUsers = candidateUsers.map((user) => ({
      ...user,
      rank: calculateRank(user.mmr),
      ...calculateSuspicion(user),
    }))

    const filteredUsers = enrichedUsers
      .filter((entry) => {
        if (filter === 'suspicious') return entry.isComputedSuspicious || entry.isSuspect
        if (filter === 'banned') return entry.isBanned
        if (filter === 'clean') return !entry.isComputedSuspicious && !entry.isSuspect && !entry.isBanned
        return true
      })
      .sort((a, b) => {
        if (filter === 'suspicious') return b.suspicionScore - a.suspicionScore || b.createdAt.getTime() - a.createdAt.getTime()
        return b.createdAt.getTime() - a.createdAt.getTime()
      })

    const total = filteredUsers.length
    const users = filteredUsers.slice((page - 1) * limit, page * limit)

    res.json({
      users,
      total,
      page,
      pages: Math.ceil(total / limit),
    })
  } catch (err) {
    next(err)
  }
})

adminRouter.patch('/users/:id/suspect', async (req, res, next) => {
  try {
    const { suspect, reason } = z.object({
      suspect: z.boolean(),
      reason: z.string().max(180).optional(),
    }).parse(req.body)
    const actorId = (req as unknown as AuthRequest).userId

    const user = await db.$transaction(async (tx) => {
      const before = await tx.user.findUnique({
        where: { id: req.params.id },
        select: { id: true, username: true, isSuspect: true },
      })

      if (!before) throw Errors.NOT_FOUND('User')

      const updated = await tx.user.update({
        where: { id: req.params.id },
        data: { isSuspect: suspect },
        select: {
          id: true,
          username: true,
          isSuspect: true,
          isBanned: true,
          createdAt: true,
          discordCreatedAt: true,
          discordId: true,
          googleId: true,
          bnetId: true,
          mmr: true,
          wins: true,
          losses: true,
        },
      })

      await recordAdminAudit(tx, {
        actorId,
        targetUserId: updated.id,
        action: suspect ? 'USER_SUSPECT_MARKED' : 'USER_SUSPECT_CLEARED',
        entityType: 'USER',
        entityId: updated.id,
        summary: suspect
          ? `Marcó a ${updated.username} como sospechoso${reason ? ` (${reason.slice(0, 80)})` : ''}.`
          : `Limpió el flag sospechoso de ${updated.username}.`,
        metadata: {
          beforeIsSuspect: before.isSuspect,
          afterIsSuspect: updated.isSuspect,
          reason: reason ?? null,
          suspicion: calculateSuspicion(updated),
        },
      })

      return updated
    })

    res.json({
      id: user.id,
      username: user.username,
      isSuspect: user.isSuspect,
      ...calculateSuspicion(user),
    })
  } catch (err) {
    next(err)
  }
})

adminRouter.patch('/users/:id/mmr', async (req, res, next) => {
  try {
    const { mmr } = z.object({ mmr: z.number().min(0).max(5000) }).parse(req.body)
    const rank = calculateRank(mmr)
    const actorId = (req as unknown as AuthRequest).userId

    const user = await db.$transaction(async (tx) => {
      const before = await tx.user.findUnique({
        where: { id: req.params.id },
        select: { id: true, username: true, mmr: true, rank: true },
      })

      if (!before) throw Errors.NOT_FOUND('User')

      const updated = await tx.user.update({
        where: { id: req.params.id },
        data: { mmr, rank },
        select: { id: true, username: true, mmr: true, rank: true },
      })

      await recordAdminAudit(tx, {
          actorId,
          targetUserId: updated.id,
          action: 'USER_MMR_SET',
          entityType: 'USER',
          entityId: updated.id,
          summary: `Ajustó MMR de ${updated.username} de ${before.mmr} a ${updated.mmr}.`,
          metadata: {
            beforeMmr: before.mmr,
            afterMmr: updated.mmr,
            beforeRank: before.rank,
            afterRank: updated.rank,
            delta: updated.mmr - before.mmr,
          },
      })

      return updated
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

    const actorId = (req as unknown as AuthRequest).userId

    const user = await db.$transaction(async (tx) => {
      const before = await tx.user.findUnique({
        where: { id: req.params.id },
        select: { id: true, username: true, isBanned: true, role: true, banReason: true },
      })

      if (!before) throw Errors.NOT_FOUND('User')

      const updated = await tx.user.update({
        where: { id: req.params.id },
        data: {
          isBanned: banned,
          role: banned ? 'BANNED' : 'USER',
          banReason: reason,
          bannedAt: banned ? new Date() : null,
        },
        select: { id: true, username: true, isBanned: true, role: true, banReason: true },
      })

      await recordAdminAudit(tx, {
          actorId,
          targetUserId: updated.id,
          action: banned ? 'USER_BANNED' : 'USER_UNBANNED',
          entityType: 'USER',
          entityId: updated.id,
          summary: banned
            ? `Baneó a ${updated.username}${reason ? ` (${reason.slice(0, 80)})` : ''}.`
            : `Levantó el ban de ${updated.username}.`,
          metadata: {
            beforeIsBanned: before.isBanned,
            afterIsBanned: updated.isBanned,
            beforeRole: before.role,
            afterRole: updated.role,
            reason: reason ?? null,
            previousReason: before.banReason ?? null,
          },
      })

      return updated
    })

    res.json({ ok: true, username: user.username, isBanned: user.isBanned })
  } catch (err) {
    next(err)
  }
})

adminRouter.patch('/users/:id/role', async (req, res, next) => {
  try {
    const { role } = z.object({ role: z.enum(['USER', 'MODERATOR', 'ADMIN', 'BANNED']) }).parse(req.body)
    const actorId = (req as unknown as AuthRequest).userId

    const user = await db.$transaction(async (tx) => {
      const before = await tx.user.findUnique({
        where: { id: req.params.id },
        select: { id: true, username: true, role: true },
      })

      if (!before) throw Errors.NOT_FOUND('User')

      const updated = await tx.user.update({
        where: { id: req.params.id },
        data: { role },
        select: { id: true, username: true, role: true },
      })

      await recordAdminAudit(tx, {
          actorId,
          targetUserId: updated.id,
          action: 'USER_ROLE_SET',
          entityType: 'USER',
          entityId: updated.id,
          summary: `Cambió role de ${updated.username} de ${before.role} a ${updated.role}.`,
          metadata: {
            beforeRole: before.role,
            afterRole: updated.role,
          },
      })

      return updated
    })

    res.json(user)
  } catch (err) {
    next(err)
  }
})


const AdminScrimSchema = z.object({
  team1Name: z.string().trim().min(2).max(80),
  team2Name: z.string().trim().min(2).max(80),
  captain1UserId: z.string().trim().min(1),
  captain2UserId: z.string().trim().min(1),
  team1PlayerIds: z.array(z.string().trim().min(1)).max(5).default([]),
  team2PlayerIds: z.array(z.string().trim().min(1)).max(5).default([]),
  notes: z.string().trim().max(500).optional().nullable(),
  scheduledAt: z.string().datetime().optional().nullable(),
})

adminRouter.get('/scrims', async (req, res, next) => {
  try {
    const limit = z.coerce.number().int().min(1).max(100).parse(req.query.limit ?? 30)
    res.json({ scrims: await listAdminScrims(limit) })
  } catch (err) {
    next(err)
  }
})

adminRouter.post('/scrims', async (req, res, next) => {
  try {
    const actorId = (req as unknown as AuthRequest).userId
    const payload = AdminScrimSchema.parse(req.body ?? {})
    const match = await createAdminScrim({
      actorId,
      ...payload,
    })

    await recordAdminAudit(db, {
      actorId,
      action: 'SCRIM_CREATED',
      entityType: 'MATCH',
      entityId: match.id,
      summary: `Creó scrim ${payload.team1Name} vs ${payload.team2Name}.`,
      metadata: {
        team1Name: payload.team1Name,
        team2Name: payload.team2Name,
        playerCount: match.players?.length ?? 0,
      } as Prisma.InputJsonValue,
    })

    res.status(201).json({ ok: true, match, matchId: match.id })
  } catch (err) {
    next(err)
  }
})

adminRouter.post('/teams/:teamId/test-bots', async (req, res, next) => {
  try {
    const actorId = (req as unknown as AuthRequest).userId
    const payload = z.object({
      targetSize: z.number().int().min(1).max(10).default(5),
    }).parse(req.body ?? {})
    const result = await addTestBotsToTeam(req.params.teamId, payload)

    await recordAdminAudit(db, {
      actorId,
      action: 'TEAM_TEST_BOTS_ADDED',
      entityType: 'TEAM',
      entityId: req.params.teamId,
      summary: `Agregó ${result.addedCount} bots de prueba al equipo ${req.params.teamId.slice(0, 8)}.`,
      metadata: result as Prisma.InputJsonValue,
    })

    res.status(201).json({ ok: true, ...result })
  } catch (err) {
    next(err)
  }
})

// ─── Matches ──────────────────────────────────────────────

adminRouter.get('/matches', async (req, res, next) => {
  try {
    const status = req.query.status as string | undefined
    const matches = await (db.match as any).findMany({
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
    res.json(await attachScrimDetailsToMatches(matches))
  } catch (err) {
    next(err)
  }
})

adminRouter.patch('/matches/:id/cancel', async (req, res, next) => {
  try {
    const actorId = (req as unknown as AuthRequest).userId
    const match = await db.match.findUnique({
      where: { id: req.params.id },
      include: {
        players: { select: { userId: true } },
      },
    })

    if (!match) throw Errors.NOT_FOUND('Match')
    if (match.status === 'COMPLETED') throw Errors.CONFLICT('Completed matches cannot be cancelled')

    await db.$transaction([
      db.match.update({
        where: { id: match.id },
        data: {
          status: 'CANCELLED',
          endedAt: match.endedAt ?? new Date(),
        },
      }),
      db.$executeRaw(Prisma.sql`
        INSERT INTO "AdminAuditLog" (
          "id",
          "actorId",
          "targetUserId",
          "action",
          "entityType",
          "entityId",
          "summary",
          "metadata"
        )
        VALUES (
          ${randomUUID()},
          ${actorId},
          NULL,
          ${'MATCH_CANCELLED'},
          ${'MATCH'},
          ${match.id},
          ${`Canceló el match ${match.id.slice(0, 8)} (${match.status}).`},
          ${JSON.stringify({
            previousStatus: match.status,
            playerCount: match.players.length,
          })}::jsonb
        )
      `),
    ])

    await clearMatchRuntimeState(match.id)
    await emitAdminMatchReset(match.id, match.players, 'Admin cancelled match')

    res.json({ ok: true, matchId: match.id, status: 'CANCELLED' })
  } catch (err) {
    next(err)
  }
})

adminRouter.delete('/matches/:id', async (req, res, next) => {
  try {
    const actorId = (req as unknown as AuthRequest).userId
    const match = await db.match.findUnique({
      where: { id: req.params.id },
      include: {
        players: { select: { userId: true } },
      },
    })

    if (!match) throw Errors.NOT_FOUND('Match')

    await clearMatchRuntimeState(match.id)
    await emitAdminMatchReset(match.id, match.players, 'Admin deleted match')
    await db.$transaction([
      db.$executeRaw(Prisma.sql`
        INSERT INTO "AdminAuditLog" (
          "id",
          "actorId",
          "targetUserId",
          "action",
          "entityType",
          "entityId",
          "summary",
          "metadata"
        )
        VALUES (
          ${randomUUID()},
          ${actorId},
          NULL,
          ${'MATCH_DELETED'},
          ${'MATCH'},
          ${match.id},
          ${`Borró el match ${match.id.slice(0, 8)} (${match.status}).`},
          ${JSON.stringify({
            previousStatus: match.status,
            playerCount: match.players.length,
          })}::jsonb
        )
      `),
      db.match.delete({
        where: { id: match.id },
      }),
    ])

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

adminRouter.get('/matchmaking/metrics', async (_req, res, next) => {
  try {
    const metrics = await getMatchmakingAdminMetrics()
    res.json(metrics)
  } catch (err) {
    next(err)
  }
})

adminRouter.post('/queue/clear', async (req, res, next) => {
  try {
    const actorId = (req as unknown as AuthRequest).userId
    const result = await clearQueue('Admin cleared queue')
    await recordAdminAudit(db, {
      actorId,
      action: 'QUEUE_CLEARED',
      entityType: 'QUEUE',
      entityId: 'SA',
      summary: `Limpió la cola SA y desalojó ${result.cleared} entradas.`,
      metadata: result as Prisma.InputJsonValue,
    })
    res.json({ ok: true, ...result })
  } catch (err) {
    next(err)
  }
})

adminRouter.post('/queue/fill-bots', async (req, res, next) => {
  try {
    const actorId = (req as unknown as AuthRequest).userId
    const { targetSize } = z.object({ targetSize: z.number().int().min(2).max(10).default(10) }).parse(req.body ?? {})
    const result = await fillQueueWithBots(targetSize)
    await recordAdminAudit(db, {
      actorId,
      action: 'QUEUE_FILLED_WITH_BOTS',
      entityType: 'QUEUE',
      entityId: 'SA',
      summary: `Completó la cola SA con bots hasta ${targetSize} jugadores.`,
      metadata: {
        targetSize,
        ...result,
      },
    })
    res.json({ ok: true, ...result })
  } catch (err) {
    next(err)
  }
})

adminRouter.get('/audit-logs', async (req, res, next) => {
  try {
    const limit = z.coerce.number().int().min(1).max(100).parse(req.query.limit ?? 20)
    const logs = await db.$queryRaw<Array<{
      id: string
      action: string
      entityType: string
      entityId: string | null
      summary: string
      metadata: Prisma.JsonValue | null
      createdAt: Date
      actorId: string | null
      actorUsername: string | null
      targetUserId: string | null
      targetUsername: string | null
    }>>(Prisma.sql`
      SELECT
        log."id",
        log."action",
        log."entityType",
        log."entityId",
        log."summary",
        log."metadata",
        log."createdAt",
        actor."id" AS "actorId",
        actor."username" AS "actorUsername",
        target."id" AS "targetUserId",
        target."username" AS "targetUsername"
      FROM "AdminAuditLog" log
      LEFT JOIN "User" actor ON actor."id" = log."actorId"
      LEFT JOIN "User" target ON target."id" = log."targetUserId"
      ORDER BY log."createdAt" DESC
      LIMIT ${limit}
    `)

    res.json({
      count: logs.length,
      logs: logs.map((entry) => ({
        id: entry.id,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId,
        summary: entry.summary,
        metadata: entry.metadata,
        createdAt: entry.createdAt,
        actor: entry.actorId ? { id: entry.actorId, username: entry.actorUsername ?? 'Unknown admin' } : null,
        targetUser: entry.targetUserId ? { id: entry.targetUserId, username: entry.targetUsername ?? 'Unknown user' } : null,
      })),
    })
  } catch (err) {
    if (isMissingAdminAuditLogRelation(err)) {
      res.json({ count: 0, logs: [] })
      return
    }

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
    const [totalUsers, suspectUsers, activeMatches, completedMatches] = await Promise.all([
      db.user.count(),
      db.user.count({ where: { isSuspect: true } }),
      db.match.count({ where: { status: { in: ['ACCEPTING', 'VETOING', 'PLAYING', 'VOTING'] } } }),
      db.match.count({ where: { status: 'COMPLETED' } }),
    ])

    const queueSize = await redis.zcard(REDIS_KEYS.matchmakingQueue('SA'))

    res.json({ totalUsers, suspectUsers, activeMatches, completedMatches, playersInQueue: queueSize })
  } catch (err) {
    next(err)
  }
})
