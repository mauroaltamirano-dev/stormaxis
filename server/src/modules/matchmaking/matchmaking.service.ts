import { redis, REDIS_KEYS } from '../../infrastructure/redis/client'
import { db } from '../../infrastructure/database/client'
import { getIO } from '../../infrastructure/socket/server'
import { Errors } from '../../shared/errors/AppError'
import { calculateRank } from '../users/player-progression'
import { HOTS_MAPS } from '@nexusgg/shared'
import { logger } from '../../infrastructure/logging/logger'

function toPositiveInt(value: string | undefined, fallback: number) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback
}

const REGION = 'SA'
const MATCH_SIZE = toPositiveInt(process.env.MATCHMAKING_MATCH_SIZE, 10)
const BASE_MMR_TOLERANCE = toPositiveInt(
  process.env.MATCHMAKING_MMR_TOLERANCE_BASE,
  process.env.NODE_ENV === 'production' ? 300 : 500,
)
const MAX_MMR_TOLERANCE = toPositiveInt(
  process.env.MATCHMAKING_MMR_TOLERANCE_MAX,
  process.env.NODE_ENV === 'production' ? 800 : 1200,
)
const MMR_TOLERANCE_STEP = toPositiveInt(process.env.MATCHMAKING_MMR_TOLERANCE_STEP, 50)
const MMR_TOLERANCE_STEP_MS = toPositiveInt(process.env.MATCHMAKING_MMR_TOLERANCE_STEP_MS, 10_000)
const IGNORE_MMR_BALANCE = ['1', 'true', 'yes', 'on'].includes(
  String(process.env.MATCHMAKING_IGNORE_MMR_BALANCE ?? '').toLowerCase(),
)
const ACCEPT_TIMEOUT_MS = 30_000
const VETO_TIMEOUT_MS = 30_000
const VETO_TIMEOUT_GRACE_MS = 500
const MATCH_FORM_DELAY_MS = 3_000
const ACCEPT_REDIS_RETRIES = 6
const ACTIVE_MATCH_BLOCKING_STATUSES = ['PENDING', 'ACCEPTING', 'VETOING', 'PLAYING', 'VOTING'] as const
type TeamId = 1 | 2
type MatchVetoState = {
  remainingMaps: string[]
  currentTurn: TeamId
  vetoOrder: TeamId[]
  vetoIndex: number
  timeoutAt: number
  captains: Record<TeamId, string>
}

type PendingAcceptState = {
  acceptedBy: string[]
  declinedBy: string[]
  expiresAt: number
  totalPlayers: number
}

type QueueCandidate = {
  userId: string | null
  mmr: number
  isBot: boolean
  botName: string | null
  joinedAt: number | null
}

type QueueProgressEvent = {
  position: number
  queueSize: number
  matchSize: number
  etaSeconds: number
  waitedSeconds: number | null
}

const BOT_QUEUE_PREFIX = 'bot:'
const ETA_HISTORY_SIZE = 30
const DEFAULT_ETA_SECONDS_PER_PLAYER = 12
const DEFAULT_ETA_FLOOR_SECONDS = 3

function isBotQueueId(value: string) {
  return value.startsWith(BOT_QUEUE_PREFIX)
}

function toBotName(index: number) {
  return `TestBot ${index}`
}

function normalizeQueueMMR(value: number) {
  return Math.max(500, Math.min(3500, Math.round(value)))
}

function safeParsePositiveInt(value: string | null | undefined) {
  if (typeof value !== 'string') return null
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) return null
  return Math.round(parsed)
}

function median(values: number[]) {
  if (values.length === 0) return null
  const ordered = [...values].sort((a, b) => a - b)
  const mid = Math.floor(ordered.length / 2)
  if (ordered.length % 2 === 0) {
    return Math.round((ordered[mid - 1] + ordered[mid]) / 2)
  }
  return ordered[mid]
}

async function getRecentQueueEtaConfig() {
  const [cycleRaw, waitRaw] = await Promise.all([
    redis.lrange(REDIS_KEYS.matchmakingCycleHistory(REGION), 0, ETA_HISTORY_SIZE - 1),
    redis.lrange(REDIS_KEYS.matchmakingWaitHistory(REGION), 0, ETA_HISTORY_SIZE - 1),
  ])

  const cycleSamples = cycleRaw
    .map((sample) => safeParsePositiveInt(sample))
    .filter((value): value is number => value != null && value <= 600)

  const waitSamples = waitRaw
    .map((sample) => safeParsePositiveInt(sample))
    .filter((value): value is number => value != null && value <= 3600)

  const cycleSeconds = Math.max(
    1,
    median(cycleSamples) ?? Math.max(1, Math.round(MATCH_FORM_DELAY_MS / 1000)),
  )

  const waitMedian = median(waitSamples)
  const secondsPerPlayer = waitMedian
    ? Math.max(2, Math.round(waitMedian / Math.max(1, MATCH_SIZE)))
    : DEFAULT_ETA_SECONDS_PER_PLAYER

  return { cycleSeconds, secondsPerPlayer }
}

async function recordQueueFormationMetrics(players: QueueCandidate[]) {
  const now = Date.now()
  const lastFormedAtRaw = await redis.get(REDIS_KEYS.matchmakingLastFormedAt(REGION))
  const lastFormedAt = safeParsePositiveInt(lastFormedAtRaw)

  const waitedSamples = players
    .filter((player) => !player.isBot && player.joinedAt != null)
    .map((player) => Math.max(1, Math.round((now - Number(player.joinedAt)) / 1000)))

  const intervalSeconds = lastFormedAt ? Math.round((now - lastFormedAt) / 1000) : null
  const waitedAverage = waitedSamples.length
    ? Math.round(waitedSamples.reduce((sum, item) => sum + item, 0) / waitedSamples.length)
    : null

  const tx = redis.multi()
  tx.set(REDIS_KEYS.matchmakingLastFormedAt(REGION), String(now))

  if (intervalSeconds != null && intervalSeconds > 0 && intervalSeconds <= 600) {
    tx.lpush(REDIS_KEYS.matchmakingCycleHistory(REGION), String(intervalSeconds))
    tx.ltrim(REDIS_KEYS.matchmakingCycleHistory(REGION), 0, ETA_HISTORY_SIZE - 1)
  }

  if (waitedAverage != null && waitedAverage > 0 && waitedAverage <= 3600) {
    tx.lpush(REDIS_KEYS.matchmakingWaitHistory(REGION), String(waitedAverage))
    tx.ltrim(REDIS_KEYS.matchmakingWaitHistory(REGION), 0, ETA_HISTORY_SIZE - 1)
  }

  await tx.exec()
}

async function emitQueuePositionUpdates() {
  let io: ReturnType<typeof getIO> | null = null
  try {
    io = getIO()
  } catch {
    return
  }
  if (!io) return

  const queueIds = await redis.zrange(REDIS_KEYS.matchmakingQueue(REGION), 0, -1)
  const userQueueIds = queueIds.filter((queueId) => !isBotQueueId(queueId))
  const totalQueueSize = queueIds.length
  const now = Date.now()
  let cycleSeconds = Math.max(1, Math.round(MATCH_FORM_DELAY_MS / 1000))
  let secondsPerPlayer = DEFAULT_ETA_SECONDS_PER_PLAYER
  try {
    const metrics = await getRecentQueueEtaConfig()
    cycleSeconds = metrics.cycleSeconds
    secondsPerPlayer = metrics.secondsPerPlayer
  } catch (err) {
    logger.warn('Failed to resolve queue ETA metrics, using defaults', err)
  }

  const payloads = await Promise.all(
    userQueueIds.map(async (queueId, index) => {
      const raw = await redis.get(REDIS_KEYS.userInQueue(queueId))
      let joinedAt: number | null = null

      if (raw) {
        try {
          const parsed = JSON.parse(raw) as { joinedAt?: number }
          joinedAt = typeof parsed.joinedAt === 'number' ? parsed.joinedAt : null
        } catch {
          joinedAt = null
        }
      }

      const waitedSeconds = joinedAt ? Math.max(0, Math.round((now - joinedAt) / 1000)) : null
      const cyclesAhead = Math.floor(index / MATCH_SIZE)
      const missingPlayers = Math.max(0, MATCH_SIZE - totalQueueSize)
      const totalEtaSeconds = Math.max(
        DEFAULT_ETA_FLOOR_SECONDS,
        cycleSeconds * (cyclesAhead + 1) + missingPlayers * secondsPerPlayer,
      )
      const floorEta = missingPlayers > 0
        ? Math.max(DEFAULT_ETA_FLOOR_SECONDS, missingPlayers * secondsPerPlayer)
        : 1
      const etaSeconds = waitedSeconds == null
        ? totalEtaSeconds
        : Math.max(floorEta, totalEtaSeconds - waitedSeconds)

      const event: QueueProgressEvent = {
        position: index + 1,
        queueSize: totalQueueSize,
        matchSize: MATCH_SIZE,
        etaSeconds,
        waitedSeconds,
      }

      return { queueId, event }
    }),
  )

  for (const { queueId, event } of payloads) {
    io.to(`user:${queueId}`).emit('matchmaking:queue_update', event)
  }
}

export async function joinQueue(userId: string, mode: string, roles: string[]) {
  // Prevent double-queue
  const alreadyInQueue = await redis.get(REDIS_KEYS.userInQueue(userId))
  if (alreadyInQueue) throw Errors.CONFLICT('Already in queue')

  const activeMatch = await db.matchPlayer.findFirst({
    where: {
      userId,
      match: {
        status: { in: [...ACTIVE_MATCH_BLOCKING_STATUSES] },
      },
    },
    select: { matchId: true },
  })
  if (activeMatch) {
    throw Errors.CONFLICT('Cannot join queue while you have an active match')
  }

  const user = await db.user.findUnique({
    where: { id: userId },
    select: { mmr: true, isBanned: true },
  })
  if (!user) throw Errors.NOT_FOUND('User')
  if (user.isBanned) throw Errors.FORBIDDEN()

  // Add to sorted set by MMR
  await redis.zadd(REDIS_KEYS.matchmakingQueue(REGION), user.mmr, userId)
  // Mark user as in queue (with metadata)
  await redis.setex(
    REDIS_KEYS.userInQueue(userId),
    600, // 10 min max in queue
    JSON.stringify({ mode, roles, mmr: user.mmr, joinedAt: Date.now() }),
  )

  void emitQueuePositionUpdates()

  return { mmr: user.mmr }
}

export async function leaveQueue(userId: string) {
  await redis.zrem(REDIS_KEYS.matchmakingQueue(REGION), userId)
  await redis.del(REDIS_KEYS.userInQueue(userId))
  void emitQueuePositionUpdates()
}

export async function fillQueueWithBots(targetSize = MATCH_SIZE) {
  const queueKey = REDIS_KEYS.matchmakingQueue(REGION)
  const entries = await redis.zrange(queueKey, 0, -1, 'WITHSCORES')
  const currentSize = Math.floor(entries.length / 2)
  const missing = Math.max(0, targetSize - currentSize)
  if (missing === 0) return { inserted: 0, queueSize: currentSize }

  const realMMRs: number[] = []
  for (let i = 0; i < entries.length; i += 2) {
    const id = entries[i]
    const mmr = Number(entries[i + 1])
    if (!isBotQueueId(id)) realMMRs.push(mmr)
  }

  if (realMMRs.length < 2) {
    throw Errors.VALIDATION('Se necesitan al menos 2 jugadores reales para completar con bots')
  }

  const avgMMR = realMMRs.reduce((sum, mmr) => sum + mmr, 0) / realMMRs.length

  for (let i = 0; i < missing; i++) {
    const jitter = (Math.random() - 0.5) * 120
    const botMMR = normalizeQueueMMR(avgMMR + jitter)
    const botId = `${BOT_QUEUE_PREFIX}${Date.now()}:${Math.floor(Math.random() * 1_000_000)}`
    const botName = toBotName(i + 1)
    await redis.zadd(queueKey, botMMR, botId)
    await redis.setex(
      REDIS_KEYS.userInQueue(botId),
      600,
      JSON.stringify({ mode: 'COMPETITIVE', roles: [], mmr: botMMR, joinedAt: Date.now(), isBot: true, botName }),
    )
  }

  await scheduleTryFormMatch()
  void emitQueuePositionUpdates()
  const queueSize = await redis.zcard(queueKey)
  return { inserted: missing, queueSize }
}

export async function getQueueStatus(userId: string) {
  const inQueue = await redis.get(REDIS_KEYS.userInQueue(userId))
  if (!inQueue) return { inQueue: false }

  const queueSize = await redis.zcard(REDIS_KEYS.matchmakingQueue(REGION))
  return { inQueue: true, queueSize, ...JSON.parse(inQueue) }
}

export async function getQueueSnapshot() {
  const entries = await redis.zrange(REDIS_KEYS.matchmakingQueue(REGION), 0, -1, 'WITHSCORES')

  const players = await Promise.all(
    Array.from({ length: Math.floor(entries.length / 2) }, async (_, index) => {
      const userId = entries[index * 2]
      const mmr = Number(entries[index * 2 + 1])
      const metaRaw = await redis.get(REDIS_KEYS.userInQueue(userId))
      const meta = metaRaw ? JSON.parse(metaRaw) : {}
      const isBot = Boolean(meta.isBot) || isBotQueueId(userId)
      const user = isBot
        ? null
        : await db.user.findUnique({
            where: { id: userId },
            select: { username: true, avatar: true },
          })

      const username = isBot ? (meta.botName ?? 'TestBot') : (user?.username ?? 'Unknown')

      return {
        userId,
        username,
        avatar: isBot ? null : (user?.avatar ?? null),
        mmr,
        joinedAt: meta.joinedAt ?? null,
        mode: meta.mode ?? 'COMPETITIVE',
        roles: Array.isArray(meta.roles) ? meta.roles : [],
        isBot,
      }
    }),
  )

  return { count: players.length, players }
}

export async function scheduleTryFormMatch() {
  const queueSize = await redis.zcard(REDIS_KEYS.matchmakingQueue(REGION))
  if (queueSize < MATCH_SIZE) return false

  const scheduleKey = REDIS_KEYS.matchmakingScheduleLock(REGION)
  const acquired = await redis.set(scheduleKey, String(Date.now()), 'EX', 10, 'NX')
  if (!acquired) return false

  setTimeout(async () => {
    try {
      await tryFormMatch()
    } finally {
      await redis.del(scheduleKey)
      const remaining = await redis.zcard(REDIS_KEYS.matchmakingQueue(REGION))
      if (remaining >= MATCH_SIZE) {
        await scheduleTryFormMatch()
      }
    }
  }, MATCH_FORM_DELAY_MS)

  return true
}

export async function getActiveMatch(userId: string) {
  const activePlayer = await db.matchPlayer.findFirst({
    where: {
      userId,
      match: {
        status: { in: ['ACCEPTING', 'VETOING', 'PLAYING', 'VOTING'] },
      },
    },
    orderBy: {
      match: { createdAt: 'desc' },
    },
    include: {
      match: {
        include: {
          players: { include: { user: { select: { id: true, username: true, avatar: true, mmr: true } } } },
          vetoes: { orderBy: { order: 'asc' } },
          votes: { select: { userId: true, winner: true } },
        },
      },
    },
  })

  if (!activePlayer) return null

  const match = activePlayer.match
  const pendingRaw = match.status === 'ACCEPTING' ? await redis.get(REDIS_KEYS.pendingMatch(match.id)) : null
  const pendingState = pendingRaw
    ? JSON.parse(pendingRaw) as { expiresAt: number; acceptedBy: string[]; totalPlayers: number }
    : null

  return {
    id: match.id,
    status: match.status,
    selectedMap: match.selectedMap,
    winner: match.winner,
    createdAt: match.createdAt,
    startedAt: match.startedAt,
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
    vetoes: match.vetoes,
    votes: match.votes,
    pending: pendingState
      ? {
          matchId: match.id,
          expiresAt: pendingState.expiresAt,
          acceptedBy: pendingState.acceptedBy,
          acceptedCount: pendingState.acceptedBy.length,
          totalPlayers: pendingState.totalPlayers,
          teams: {
            team1: match.players.filter((p) => p.team === 1).map((p) => ({
              id: p.userId ?? p.id,
              username: p.user?.username ?? p.botName ?? 'TestBot',
              avatar: p.user?.avatar ?? null,
              rank: calculateRank(p.user?.mmr ?? p.mmrBefore),
              mmr: p.user?.mmr ?? p.mmrBefore,
              isBot: p.isBot,
            })),
            team2: match.players.filter((p) => p.team === 2).map((p) => ({
              id: p.userId ?? p.id,
              username: p.user?.username ?? p.botName ?? 'TestBot',
              avatar: p.user?.avatar ?? null,
              rank: calculateRank(p.user?.mmr ?? p.mmrBefore),
              mmr: p.user?.mmr ?? p.mmrBefore,
              isBot: p.isBot,
            })),
          },
        }
      : null,
  }
}

// Called by the matchmaking worker
export async function tryFormMatch() {
  const queueKey = REDIS_KEYS.matchmakingQueue(REGION)
  const queueSize = await redis.zcard(queueKey)

  if (queueSize < MATCH_SIZE) return null

  // Get bottom 10 (MMR ascending)
  const candidates = await redis.zrange(queueKey, 0, MATCH_SIZE - 1, 'WITHSCORES')

  // candidates = [userId1, mmr1, userId2, mmr2, ...]
  const players: QueueCandidate[] = []
  let removedStaleEntries = 0
  for (let i = 0; i < candidates.length; i += 2) {
    const queueId = candidates[i]
    const mmr = Number(candidates[i + 1])
    const metaRaw = await redis.get(REDIS_KEYS.userInQueue(queueId))
    if (!metaRaw) {
      await redis.zrem(queueKey, queueId)
      removedStaleEntries += 1
      continue
    }
    const meta = metaRaw ? JSON.parse(metaRaw) : {}
    const isBot = Boolean(meta.isBot) || isBotQueueId(queueId)
    const joinedAt = typeof meta.joinedAt === 'number' ? meta.joinedAt : null
    players.push({
      userId: isBot ? null : queueId,
      mmr,
      isBot,
      botName: isBot ? (meta.botName ?? `TestBot-${i / 2 + 1}`) : null,
      joinedAt,
    })
  }

  if (removedStaleEntries > 0) {
    void emitQueuePositionUpdates()
  }

  if (players.length < MATCH_SIZE) return null

  const humans = players.filter((player) => !player.isBot && player.userId)
  if (humans.length < 2) return null

  // Check MMR spread
  const minMMR = players[0].mmr
  const maxMMR = players[players.length - 1].mmr
  if (!IGNORE_MMR_BALANCE) {
    const tolerance = await getDynamicMMRTolerance(players)
    if (maxMMR - minMMR > tolerance) return null // Not balanced enough yet
  }

  // Remove them from queue
  const queueIds = candidates.filter((_, index) => index % 2 === 0)
  await redis.zrem(queueKey, ...queueIds)
  for (const queueId of queueIds) await redis.del(REDIS_KEYS.userInQueue(queueId))
  void emitQueuePositionUpdates()

  // Build teams: top 2 HUMAN MMR are captains; rest balanced by total MMR
  const teamSize = Math.max(1, Math.floor(MATCH_SIZE / 2))
  const humansByMMR = [...humans].sort((a, b) => b.mmr - a.mmr)
  const captainA = humansByMMR[0]
  const captainB = humansByMMR[1]
  if (!captainA || !captainB || !captainA.userId || !captainB.userId) return null

  const team1: QueueCandidate[] = [captainA]
  const team2: QueueCandidate[] = [captainB]
  let team1Total = captainA.mmr
  let team2Total = captainB.mmr

  const remaining = players.filter((candidate) => candidate !== captainA && candidate !== captainB)
  const sortedRemaining = [...remaining].sort((a, b) => b.mmr - a.mmr)
  for (const candidate of sortedRemaining) {
    const canJoinTeam1 = team1.length < teamSize
    const canJoinTeam2 = team2.length < teamSize

    if (canJoinTeam1 && !canJoinTeam2) {
      team1.push(candidate)
      team1Total += candidate.mmr
      continue
    }

    if (!canJoinTeam1 && canJoinTeam2) {
      team2.push(candidate)
      team2Total += candidate.mmr
      continue
    }

    if (team1Total <= team2Total) {
      team1.push(candidate)
      team1Total += candidate.mmr
    } else {
      team2.push(candidate)
      team2Total += candidate.mmr
    }
  }

  const team1CaptainId = captainA.userId
  const team2CaptainId = captainB.userId

  const match = await db.match.create({
    data: {
      status: 'ACCEPTING',
      players: {
        create: [
          ...team1.map((p) => ({
            userId: p.userId,
            isBot: p.isBot,
            botName: p.botName,
            team: 1,
            mmrBefore: p.mmr,
            isCaptain: p.userId === team1CaptainId,
          })),
          ...team2.map((p) => ({
            userId: p.userId,
            isBot: p.isBot,
            botName: p.botName,
            team: 2,
            mmrBefore: p.mmr,
            isCaptain: p.userId === team2CaptainId,
          })),
        ],
      },
    },
    include: {
      players: { include: { user: { select: { id: true, username: true, avatar: true, mmr: true } } } },
    },
  })

  // Store accept state in Redis with TTL
  await redis.setex(
    REDIS_KEYS.pendingMatch(match.id),
    60,
    JSON.stringify({
      acceptedBy: [],
      declinedBy: [],
      expiresAt: Date.now() + ACCEPT_TIMEOUT_MS,
      totalPlayers: match.players.filter((player) => !player.isBot).length,
    }),
  )

  // Notify all 10 players via Socket.io
  const io = getIO()
  const expiresAt = Date.now() + ACCEPT_TIMEOUT_MS

  for (const player of match.players.filter((entry) => !entry.isBot && entry.userId)) {
    io.to(`user:${player.userId}`).emit('matchmaking:found', {
      matchId: match.id,
      expiresAt,
      acceptedCount: 0,
      totalPlayers: match.players.filter((entry) => !entry.isBot).length,
      acceptedBy: [],
      teams: {
        team1: match.players.filter((p) => p.team === 1).map((p) => ({
          id: p.userId ?? p.id,
          username: p.isBot ? (p.botName ?? 'TestBot') : (p.user?.username ?? 'Unknown'),
          avatar: p.isBot ? null : (p.user?.avatar ?? null),
          rank: calculateRank(p.mmrBefore),
          mmr: p.mmrBefore,
          isBot: p.isBot,
        })),
        team2: match.players.filter((p) => p.team === 2).map((p) => ({
          id: p.userId ?? p.id,
          username: p.isBot ? (p.botName ?? 'TestBot') : (p.user?.username ?? 'Unknown'),
          avatar: p.isBot ? null : (p.user?.avatar ?? null),
          rank: calculateRank(p.mmrBefore),
          mmr: p.mmrBefore,
          isBot: p.isBot,
        })),
      },
    })
  }

  // Set timeout to cancel if not all accept
  setTimeout(() => cancelMatchIfNotFull(match.id), ACCEPT_TIMEOUT_MS + 1000)
  void recordQueueFormationMetrics(players).catch((err) => {
    logger.warn('Failed to record matchmaking metrics', err)
  })

  return match.id
}

export async function acceptMatch(matchId: string, userId: string) {
  const player = await db.matchPlayer.findUnique({
    where: { matchId_userId: { matchId, userId } },
    select: { id: true },
  })
  if (!player) throw Errors.FORBIDDEN()

  const key = REDIS_KEYS.pendingMatch(matchId)
  let stateAfterAccept: PendingAcceptState | null = null
  let acceptedNow = false

  for (let attempt = 0; attempt < ACCEPT_REDIS_RETRIES; attempt++) {
    await redis.watch(key)
    const stateRaw = await redis.get(key)
    if (!stateRaw) {
      await redis.unwatch()
      throw Errors.NOT_FOUND('Match accept window')
    }

    const state = JSON.parse(stateRaw) as PendingAcceptState
    if (state.declinedBy.includes(userId) || state.acceptedBy.includes(userId)) {
      await redis.unwatch()
      stateAfterAccept = state
      break
    }

    state.acceptedBy.push(userId)
    const ttlSeconds = await redis.ttl(key)
    const ttlToPersist = ttlSeconds > 0 ? ttlSeconds : 60

    const tx = redis.multi()
    tx.setex(key, ttlToPersist, JSON.stringify(state))
    const execResult = await tx.exec()

    if (execResult) {
      stateAfterAccept = state
      acceptedNow = true
      break
    }
  }

  if (!stateAfterAccept) {
    throw Errors.CONFLICT('Could not accept match due concurrent updates. Retry.')
  }

  if (!acceptedNow) return

  await emitAcceptProgress(matchId, stateAfterAccept)

  await db.matchPlayer.update({
    where: { matchId_userId: { matchId, userId } },
    data: { accepted: true },
  })

  if (stateAfterAccept.acceptedBy.length === stateAfterAccept.totalPlayers) {
    // All accepted — start veto
    await startVeto(matchId)
  }
}

export async function declineMatch(matchId: string, userId: string) {
  await db.matchPlayer.update({
    where: { matchId_userId: { matchId, userId } },
    data: { accepted: false },
  })

  await cancelMatch(matchId, 'Player declined')

  // Return declining player to queue
  const player = await db.matchPlayer.findUnique({
    where: { matchId_userId: { matchId, userId } },
  })
  if (player && player.userId) {
    await joinQueue(userId, 'COMPETITIVE', [])
  }
}

async function cancelMatchIfNotFull(matchId: string) {
  const state = await redis.get(REDIS_KEYS.pendingMatch(matchId))
  if (!state) return

  const parsed = JSON.parse(state)
  if (parsed.acceptedBy.length < parsed.totalPlayers) {
    await cancelMatch(matchId, 'Accept timeout')
  }
}

async function cancelMatch(matchId: string, reason: string) {
  await redis.del(REDIS_KEYS.pendingMatch(matchId))
  await redis.del(REDIS_KEYS.matchReadyState(matchId))
  await redis.del(REDIS_KEYS.matchVotingState(matchId))
  await redis.del(REDIS_KEYS.matchFinishState(matchId))
  await redis.del(REDIS_KEYS.matchCancelState(matchId))

  await db.match.update({ where: { id: matchId }, data: { status: 'CANCELLED' } })

  const io = getIO()
  const players = await db.matchPlayer.findMany({ where: { matchId } })

  for (const p of players) {
    if (p.userId) {
      io.to(`user:${p.userId}`).emit('matchmaking:cancelled', { reason })
    }
    // Return players who accepted back to queue
    if (p.accepted === true && p.userId) {
      await joinQueue(p.userId, 'COMPETITIVE', [])
    }
  }
}

// ─── Map Veto ────────────────────────────────────────────

// Veto order: T1, T2, T1, T2 ... until only 1 map remains

async function startVeto(matchId: string) {
  await redis.del(REDIS_KEYS.pendingMatch(matchId))

  const match = await db.match.update({
    where: { id: matchId },
    data: { status: 'VETOING' },
    include: { players: { where: { isCaptain: true } } },
  })

  const vetoOrder = Array.from(
    { length: Math.max(0, HOTS_MAPS.length - 1) },
    (_, index) => (index % 2 === 0 ? 1 : 2) as TeamId,
  ) as TeamId[]

  const vetoState: MatchVetoState = {
    remainingMaps: HOTS_MAPS.map((m) => m.id),
    currentTurn: vetoOrder[0] ?? 1,
    vetoOrder,
    vetoIndex: 0,
    timeoutAt: Date.now() + VETO_TIMEOUT_MS,
    captains: {
      1: match.players.find((p) => p.team === 1 && p.isCaptain)?.userId ?? '',
      2: match.players.find((p) => p.team === 2 && p.isCaptain)?.userId ?? '',
    },
  }

  if (!vetoState.captains[1] || !vetoState.captains[2]) {
    throw Errors.CONFLICT('No se pudieron asignar capitanes humanos para el veto')
  }

  await redis.setex(
    REDIS_KEYS.matchVetoState(matchId),
    3600,
    JSON.stringify(vetoState),
  )

  const io = getIO()
  const timeoutAt = Date.now() + VETO_TIMEOUT_MS

  io.to(`match:${matchId}`).emit('veto:start', {
    captains: vetoState.captains,
    maps: HOTS_MAPS,
    order: vetoState.vetoOrder,
    currentTurn: vetoState.currentTurn,
    vetoIndex: vetoState.vetoIndex,
    timeoutAt,
    remainingMaps: vetoState.remainingMaps,
  })

  io.to(`match:${matchId}`).emit('veto:turn', {
    team: vetoState.currentTurn,
    currentTurn: vetoState.currentTurn,
    vetoIndex: vetoState.vetoIndex,
    vetoOrder: vetoState.vetoOrder,
    captains: vetoState.captains,
    captainId: vetoState.captains[vetoState.currentTurn],
    timeoutAt,
    remainingMaps: vetoState.remainingMaps,
  })

  scheduleVetoTimeout(matchId, 0, timeoutAt)
}

async function autoVetoRandomMap(matchId: string, state: MatchVetoState) {
  if (state.remainingMaps.length <= 1) return
  const randomIdx = Math.floor(Math.random() * state.remainingMaps.length)
  const mapId = state.remainingMaps[randomIdx]
  if (!mapId) return
  await performVeto(matchId, mapId, null, true)
}

function scheduleVetoTimeout(matchId: string, vetoIndex: number, timeoutAt?: number) {
  const delay = Math.max(
    200,
    (timeoutAt ?? (Date.now() + VETO_TIMEOUT_MS)) - Date.now() + VETO_TIMEOUT_GRACE_MS,
  )

  setTimeout(async () => {
    const raw = await redis.get(REDIS_KEYS.matchVetoState(matchId))
    if (!raw) return

    const state = JSON.parse(raw) as MatchVetoState
    if (state.vetoIndex !== vetoIndex) return // Already moved on

    if (state.timeoutAt && Date.now() < state.timeoutAt) {
      scheduleVetoTimeout(matchId, vetoIndex, state.timeoutAt)
      return
    }

    try {
      await autoVetoRandomMap(matchId, state)
    } catch (err) {
      logger.error('Matchmaking auto-veto failed', {
        matchId,
        vetoIndex,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }, delay)
}

export async function performVeto(
  matchId: string,
  mapId: string,
  actorId: string | null,
  auto = false,
) {
  const raw = await redis.get(REDIS_KEYS.matchVetoState(matchId))
  if (!raw) throw Errors.NOT_FOUND('Veto state')

  const state = JSON.parse(raw) as MatchVetoState
  const currentTeam = state.vetoOrder[state.vetoIndex]
  if (!currentTeam) throw Errors.CONFLICT('Veto state out of sync')

  // Validate it's the right captain (unless auto)
  if (!auto && actorId !== state.captains[currentTeam]) {
    throw Errors.FORBIDDEN()
  }

  if (!state.remainingMaps.includes(mapId)) {
    throw Errors.VALIDATION('Map already vetoed or invalid')
  }

  // Apply veto
  const map = HOTS_MAPS.find((m) => m.id === mapId)
  if (!map) throw Errors.VALIDATION('Map inválido')
  state.remainingMaps = state.remainingMaps.filter((id: string) => id !== mapId)
  state.vetoIndex++

  const io = getIO()

  await db.mapVeto.create({
    data: {
      matchId,
      mapId,
      mapName: map.name,
      team: currentTeam,
      auto,
      order: state.vetoIndex - 1,
    },
  })

  io.to(`match:${matchId}`).emit('veto:action', {
    team: currentTeam,
    mapId,
    mapName: map.name,
    actorId,
    auto,
    remainingMaps: state.remainingMaps,
  })

  // Check if veto is done (1 map left)
  if (state.remainingMaps.length === 1) {
    const selectedMap = state.remainingMaps[0]
    const selectedMapData = HOTS_MAPS.find((m) => m.id === selectedMap)
    if (!selectedMapData) throw Errors.CONFLICT('Mapa seleccionado inválido')
    const selectedMapName = selectedMapData.name

    await db.match.update({
      where: { id: matchId },
      data: { status: 'PLAYING', selectedMap: selectedMapName, startedAt: new Date() },
    })

    await redis.del(REDIS_KEYS.matchVetoState(matchId))

    io.to(`match:${matchId}`).emit('veto:complete', { selectedMap: selectedMapName })
    return
  }

  // Next turn
  const nextTeam = state.vetoOrder[state.vetoIndex]
  const timeoutAt = Date.now() + VETO_TIMEOUT_MS
  state.currentTurn = nextTeam
  state.timeoutAt = timeoutAt

  await redis.setex(REDIS_KEYS.matchVetoState(matchId), 3600, JSON.stringify(state))

  io.to(`match:${matchId}`).emit('veto:turn', {
    team: nextTeam,
    currentTurn: nextTeam,
    vetoIndex: state.vetoIndex,
    vetoOrder: state.vetoOrder,
    captains: state.captains,
    captainId: state.captains[nextTeam],
    timeoutAt,
    remainingMaps: state.remainingMaps,
  })

  scheduleVetoTimeout(matchId, state.vetoIndex, timeoutAt)
}

async function emitAcceptProgress(
  matchId: string,
  state: { acceptedBy: string[]; totalPlayers: number; expiresAt: number },
) {
  const io = getIO()
  io.to(`match:${matchId}`).emit('match:accept:update', {
    acceptedBy: state.acceptedBy,
    acceptedCount: state.acceptedBy.length,
    totalPlayers: state.totalPlayers,
    expiresAt: state.expiresAt,
  })
}

async function getDynamicMMRTolerance(players: Array<{ userId: string | null; mmr: number }>) {
  const queueMetadata = await Promise.all(
    players.map((player) => (player.userId ? redis.get(REDIS_KEYS.userInQueue(player.userId)) : Promise.resolve(null))),
  )

  const joinedAts = queueMetadata
    .map((raw) => {
      if (!raw) return null
      try {
        const parsed = JSON.parse(raw) as { joinedAt?: number }
        return typeof parsed.joinedAt === 'number' ? parsed.joinedAt : null
      } catch {
        return null
      }
    })
    .filter((joinedAt): joinedAt is number => joinedAt != null)

  if (joinedAts.length === 0) return BASE_MMR_TOLERANCE

  const oldestJoinedAt = Math.min(...joinedAts)
  const waitedMs = Math.max(0, Date.now() - oldestJoinedAt)
  const increments = Math.floor(waitedMs / MMR_TOLERANCE_STEP_MS)
  const tolerance = BASE_MMR_TOLERANCE + increments * MMR_TOLERANCE_STEP

  return Math.min(MAX_MMR_TOLERANCE, tolerance)
}
