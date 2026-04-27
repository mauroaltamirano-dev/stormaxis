import { db } from '../../infrastructure/database/client'
import { redis, REDIS_KEYS } from '../../infrastructure/redis/client'
import { getIO } from '../../infrastructure/socket/server'
import { Errors } from '../../shared/errors/AppError'
import { calculateRank } from '../users/player-progression'
import { cleanupDiscordMatchVoiceNow } from './discord-match-voice.service'

const VOTING_TIMEOUT_MS = 2 * 60_000
const MVP_VOTING_TIMEOUT_MS = 90_000
const READY_STATE_TTL_SECONDS = 60 * 60

type ReadyState = {
  readyBy: string[]
  totalPlayers: number
}

type VotingState = {
  expiresAt: number
  totalPlayers: number
  scheduledAt: number
}

type MvpVotingState = {
  expiresAt: number
  totalPlayers: number
  scheduledAt: number
}

type VetoState = {
  remainingMaps: string[]
  currentTurn: number
  vetoOrder: number[]
  vetoIndex: number
  timeoutAt?: number
  captains: Record<number, string>
}

type CancelState = {
  captainIds: string[]
  requestedBy: string[]
}

type FinishState = {
  captainIds: string[]
  requestedBy: string[]
}

type VoteCounts = {
  team1Votes: number
  team2Votes: number
  total: number
}

type MvpVoteCount = {
  nomineeUserId: string
  votes: number
}

type ReplayValidationSummary = {
  mapMatches?: boolean
  expectedHumanPlayers?: number
  matchedPlayers?: number
  minimumMatchedPlayers?: number
  battleTagLinkedPlayers?: number
  battleTagMatchedPlayers?: number
  usernameMatchedPlayers?: number
  missingBattleTagPlayers?: number
  battleTagMismatches?: number
  teamMismatches?: number
  identityConfidence?: 'high' | 'medium' | 'low'
  trustScore?: number
  issues?: string[]
}

type ReplayDecisionStatus =
  | 'auto_result_applied'
  | 'verified_existing_result'
  | 'winner_mismatch'
  | 'awaiting_manual_vote'
  | 'insufficient_data'
  | 'parser_failed'

type ReplayDecision = {
  status: ReplayDecisionStatus
  message: string
  autoApplied: boolean
  replayWinner: 1 | 2 | null
  existingWinner: 1 | 2 | null
  mapMatches: boolean
  matchedPlayers: number
  expectedHumanPlayers: number
  minimumMatchedPlayers: number
  eligibleForAutoWinner: boolean
  identityConfidence: 'high' | 'medium' | 'low'
  trustScore: number
  battleTagMatchedPlayers: number
  battleTagMismatches: number
  teamMismatches: number
  decidedAt: string
}

export async function markPlayerReady(matchId: string, userId: string) {
  const match = await db.match.findUnique({
    where: { id: matchId },
    include: { players: true },
  })
  if (!match) throw Errors.NOT_FOUND('Match')
  if (match.status !== 'PLAYING') throw Errors.CONFLICT('Match is not ready for connect confirmation')

  const player = match.players.find((entry) => entry.userId === userId)
  if (!player || player.isBot) throw Errors.FORBIDDEN()
  const humanPlayers = match.players.filter((entry) => !entry.isBot && entry.userId)

  const rawState = await redis.get(REDIS_KEYS.matchReadyState(matchId))
  const state: ReadyState = rawState
    ? JSON.parse(rawState)
    : { readyBy: [], totalPlayers: humanPlayers.length }

  if (!state.readyBy.includes(userId)) {
    state.readyBy.push(userId)
    await redis.setex(REDIS_KEYS.matchReadyState(matchId), READY_STATE_TTL_SECONDS, JSON.stringify(state))
  }

  const io = getIO()
  io.to(`match:${matchId}`).emit('match:ready_update', {
    readyBy: state.readyBy,
    totalPlayers: state.totalPlayers,
  })

  // All connected — frontend will show "Finalizar partida" button.
  // Voting opens only when a player explicitly calls finishMatch().
}

export async function finishMatch(matchId: string, userId: string) {
  const match = await db.match.findUnique({
    where: { id: matchId },
    include: { players: true },
  })
  if (!match) throw Errors.NOT_FOUND('Match')
  if (match.status !== 'PLAYING') throw Errors.CONFLICT('Match is not in PLAYING state')

  const player = match.players.find((entry) => entry.userId === userId)
  if (!player || player.isBot || !player.isCaptain) throw Errors.FORBIDDEN()
  const humanPlayers = match.players.filter((entry) => !entry.isBot && entry.userId)
  const captainIds = match.players
    .filter((entry) => entry.isCaptain && !entry.isBot && entry.userId)
    .map((entry) => entry.userId as string)
  if (captainIds.length < 2) throw Errors.CONFLICT('No hay dos capitanes humanos para cerrar la partida')

  // Validate all players are already connected (all ready)
  const rawState = await redis.get(REDIS_KEYS.matchReadyState(matchId))
  const state: ReadyState = rawState
    ? JSON.parse(rawState)
    : { readyBy: [], totalPlayers: humanPlayers.length }

  if (state.readyBy.length < state.totalPlayers) {
    throw Errors.CONFLICT('Not all players have connected yet')
  }

  const rawFinish = await redis.get(REDIS_KEYS.matchFinishState(matchId))
  const finishState: FinishState = rawFinish
    ? JSON.parse(rawFinish)
    : { captainIds, requestedBy: [] }

  if (!finishState.requestedBy.includes(userId)) {
    finishState.requestedBy.push(userId)
    await redis.setex(REDIS_KEYS.matchFinishState(matchId), READY_STATE_TTL_SECONDS, JSON.stringify(finishState))
  }

  const io = getIO()
  io.to(`match:${matchId}`).emit('match:finish:update', finishState)

  if (finishState.requestedBy.length === finishState.captainIds.length) {
    await openVoting(matchId, humanPlayers.length)
  }
}

export async function applyReplayWinnerResolution(matchId: string, upload: {
  status: string
  parsedWinnerTeam: 1 | 2 | null
  parsedSummary?: { validation?: ReplayValidationSummary | null } | null
}): Promise<ReplayDecision> {
  const validation = upload.parsedSummary?.validation ?? null
  const mapMatches = validation?.mapMatches === true
  const expectedHumanPlayers = Math.max(0, validation?.expectedHumanPlayers ?? 0)
  const matchedPlayers = Math.max(0, validation?.matchedPlayers ?? 0)
  const minimumMatchedPlayers = expectedHumanPlayers > 0
    ? Math.max(4, validation?.minimumMatchedPlayers ?? Math.ceil(expectedHumanPlayers * 0.6))
    : 0
  const enoughPlayers = expectedHumanPlayers === 0 ? matchedPlayers > 0 : matchedPlayers >= minimumMatchedPlayers
  const trustScore = Math.max(0, Math.min(100, validation?.trustScore ?? 0))
  const battleTagMismatches = Math.max(0, validation?.battleTagMismatches ?? 0)
  const teamMismatches = Math.max(0, validation?.teamMismatches ?? 0)
  const identityConfidence = validation?.identityConfidence ?? 'low'
  const hasBlockingIdentityIssues = battleTagMismatches > 0 || teamMismatches > 0
  const eligibleForAutoWinner = Boolean(
    upload.parsedWinnerTeam &&
    mapMatches &&
    enoughPlayers &&
    trustScore >= 60 &&
    identityConfidence !== 'low' &&
    !hasBlockingIdentityIssues,
  )

  const match = await db.match.findUnique({
    where: { id: matchId },
    select: {
      status: true,
      winner: true,
      players: { select: { userId: true, isBot: true } },
    },
  })
  if (!match) throw Errors.NOT_FOUND('Match')

  const decidedAt = new Date().toISOString()
  const existingWinner =
    match.winner === 1 || match.winner === 2
      ? (match.winner as 1 | 2)
      : null
  const baseDecision = {
    autoApplied: false,
    replayWinner: upload.parsedWinnerTeam,
    existingWinner,
    mapMatches,
    matchedPlayers,
    expectedHumanPlayers,
    minimumMatchedPlayers,
    eligibleForAutoWinner,
    identityConfidence,
    trustScore,
    battleTagMatchedPlayers: Math.max(0, validation?.battleTagMatchedPlayers ?? 0),
    battleTagMismatches,
    teamMismatches,
    decidedAt,
  }

  if (upload.status !== 'PARSED') {
    return {
      ...baseDecision,
      status: 'parser_failed',
      message: 'El replay quedó guardado, pero el parser no pudo validarlo todavía.',
    }
  }

  if (!upload.parsedWinnerTeam) {
    return {
      ...baseDecision,
      status: 'insufficient_data',
      message: 'El replay no trae un ganador confiable; se mantiene la validación manual.',
    }
  }

  if (!mapMatches) {
    return {
      ...baseDecision,
      status: 'awaiting_manual_vote',
      message: 'El mapa del replay no coincide con el match; dejamos la resolución manual.',
    }
  }

  if (!enoughPlayers) {
    return {
      ...baseDecision,
      status: 'awaiting_manual_vote',
      message: `El replay sólo matcheó ${matchedPlayers}/${expectedHumanPlayers || '?'} jugadores; dejamos la resolución manual.`,
    }
  }

  if (hasBlockingIdentityIssues) {
    return {
      ...baseDecision,
      status: 'awaiting_manual_vote',
      message: 'El replay tiene inconsistencias de identidad/equipo; dejamos la resolución manual para evitar falsos positivos.',
    }
  }

  if (!eligibleForAutoWinner) {
    return {
      ...baseDecision,
      status: 'awaiting_manual_vote',
      message: `Confianza del replay ${trustScore}/100 (${identityConfidence}); falta identidad BattleTag suficiente para autocerrar.`,
    }
  }

  const totalPlayers = match.players.filter((entry) => !entry.isBot && entry.userId).length

  if (match.status === 'VOTING' && !match.winner) {
    await openMvpVoting(matchId, upload.parsedWinnerTeam, totalPlayers, 'replay')
    return {
      ...baseDecision,
      autoApplied: true,
      status: 'auto_result_applied',
      message: `Replay validado: Team ${upload.parsedWinnerTeam} quedó cargado automáticamente como ganador.`,
    }
  }

  if (match.winner === upload.parsedWinnerTeam) {
    return {
      ...baseDecision,
      status: 'verified_existing_result',
      message: `Replay validado: confirma que Team ${upload.parsedWinnerTeam} fue el ganador.`,
    }
  }

  if (match.winner === 1 || match.winner === 2) {
    return {
      ...baseDecision,
      status: 'winner_mismatch',
      message: `Discrepancia detectada: el match marca Team ${match.winner}, pero el replay indica Team ${upload.parsedWinnerTeam}.`,
    }
  }

  return {
    ...baseDecision,
    status: 'insufficient_data',
    message: 'El replay se procesó, pero todavía no alcanzó para resolver el resultado automáticamente.',
  }
}


export async function castVote(matchId: string, userId: string, winner: 1 | 2) {
  const match = await db.match.findUnique({
    where: { id: matchId },
    include: { players: true },
  })
  if (!match) throw Errors.NOT_FOUND('Match')
  if (match.status !== 'VOTING') throw Errors.CONFLICT('Voting is not open')

  const player = match.players.find((entry) => entry.userId === userId)
  if (!player || player.isBot) throw Errors.FORBIDDEN()
  const totalPlayers = match.players.filter((entry) => !entry.isBot).length

  await db.vote.upsert({
    where: { matchId_userId: { matchId, userId } },
    create: { matchId, userId, winner },
    update: { winner },
  })

  const voteCounts = await getVoteCounts(matchId)
  const io = getIO()

  io.to(`match:${matchId}`).emit('vote:update', voteCounts)

  const majority = Math.floor(totalPlayers / 2) + 1

  let winnerTeam: 1 | 2 | null =
    voteCounts.team1Votes >= majority
      ? 1
      : voteCounts.team2Votes >= majority
        ? 2
        : voteCounts.total === totalPlayers && voteCounts.team1Votes !== voteCounts.team2Votes
          ? (voteCounts.team1Votes > voteCounts.team2Votes ? 1 : 2)
          : null

  if (!winnerTeam && voteCounts.total === totalPlayers) {
    winnerTeam = await resolveWinnerOnTimeout(match.players, voteCounts)
  }

  if (winnerTeam) {
    await openMvpVoting(matchId, winnerTeam, totalPlayers, 'votes')
  }
}

export async function getRealtimeMatchMeta(matchId: string) {
  const [readyRaw, votingRaw, mvpVotingRaw, vetoRaw, cancelRaw, finishRaw, voteCounts, mvpVoteCounts] = await Promise.all([
    redis.get(REDIS_KEYS.matchReadyState(matchId)),
    redis.get(REDIS_KEYS.matchVotingState(matchId)),
    redis.get(REDIS_KEYS.matchMvpVotingState(matchId)),
    redis.get(REDIS_KEYS.matchVetoState(matchId)),
    redis.get(REDIS_KEYS.matchCancelState(matchId)),
    redis.get(REDIS_KEYS.matchFinishState(matchId)),
    getVoteCounts(matchId),
    getMvpVoteCounts(matchId),
  ])

  return {
    ready: readyRaw ? (JSON.parse(readyRaw) as ReadyState) : null,
    voting: votingRaw ? (JSON.parse(votingRaw) as VotingState) : null,
    mvpVoting: mvpVotingRaw ? (JSON.parse(mvpVotingRaw) as MvpVotingState) : null,
    veto: vetoRaw ? (JSON.parse(vetoRaw) as VetoState) : null,
    cancel: cancelRaw ? (JSON.parse(cancelRaw) as CancelState) : null,
    finish: finishRaw ? (JSON.parse(finishRaw) as FinishState) : null,
    voteCounts,
    mvpVoteCounts,
  }
}

export async function castMvpVote(matchId: string, userId: string, nomineeUserId: string) {
  const match = await db.match.findUnique({
    where: { id: matchId },
    include: { players: true },
  })
  if (!match) throw Errors.NOT_FOUND('Match')
  if (match.status !== 'VOTING' || !match.winner) throw Errors.CONFLICT('MVP voting is not open')

  const rawMvpVoting = await redis.get(REDIS_KEYS.matchMvpVotingState(matchId))
  if (!rawMvpVoting) throw Errors.CONFLICT('MVP voting is not open')

  const voter = match.players.find((entry) => entry.userId === userId)
  if (!voter || voter.isBot) throw Errors.FORBIDDEN()
  if (nomineeUserId === userId) throw Errors.CONFLICT('No podés votarte como MVP')

  const nominee = match.players.find((entry) => entry.userId === nomineeUserId)
  if (!nominee || nominee.isBot) throw Errors.CONFLICT('MVP nominee is not part of this match')

  const totalPlayers = match.players.filter((entry) => !entry.isBot && entry.userId).length

  await db.$executeRaw`
    INSERT INTO "MvpVote" ("id", "matchId", "userId", "nomineeUserId", "createdAt")
    VALUES (${`mvp_${matchId}_${userId}_${Date.now()}`}, ${matchId}, ${userId}, ${nomineeUserId}, NOW())
    ON CONFLICT ("matchId", "userId")
    DO UPDATE SET "nomineeUserId" = EXCLUDED."nomineeUserId"
  `

  const mvpVoteCounts = await getMvpVoteCounts(matchId)
  const io = getIO()
  io.to(`match:${matchId}`).emit('mvp:update', {
    counts: mvpVoteCounts,
    total: mvpVoteCounts.reduce((sum, entry) => sum + entry.votes, 0),
  })

  const majority = Math.floor(totalPlayers / 2) + 1
  const majorityWinner = mvpVoteCounts.find((entry) => entry.votes >= majority)
  if (majorityWinner) {
    await finalizeMatchWithMvp(matchId, majorityWinner.nomineeUserId, 'votes')
    return
  }

  const totalVotesCast = mvpVoteCounts.reduce((sum, entry) => sum + entry.votes, 0)
  if (totalVotesCast >= totalPlayers) {
    const resolvedMvpUserId = await resolveMvpOnTimeout(matchId, match.players, match.winner as 1 | 2)
    await finalizeMatchWithMvp(matchId, resolvedMvpUserId, 'votes')
  }
}

export async function requestMatchCancellation(matchId: string, userId: string) {
  const match = await db.match.findUnique({
    where: { id: matchId },
    include: { players: true },
  })
  if (!match) throw Errors.NOT_FOUND('Match')
  if (!['VETOING', 'PLAYING', 'VOTING'].includes(match.status)) {
    throw Errors.CONFLICT('Match cannot be cancelled right now')
  }

  const player = match.players.find((entry) => entry.userId === userId)
  if (!player?.isCaptain) throw Errors.FORBIDDEN()

  const captainIds = match.players
    .filter((entry) => entry.isCaptain && !entry.isBot && entry.userId)
    .map((entry) => entry.userId as string)
  const rawState = await redis.get(REDIS_KEYS.matchCancelState(matchId))
  const state: CancelState = rawState
    ? JSON.parse(rawState)
    : { captainIds, requestedBy: [] }

  if (!state.requestedBy.includes(userId)) {
    state.requestedBy.push(userId)
    await redis.setex(REDIS_KEYS.matchCancelState(matchId), READY_STATE_TTL_SECONDS, JSON.stringify(state))
  }

  const io = getIO()
  io.to(`match:${matchId}`).emit('match:cancel:update', state)

  if (state.requestedBy.length === state.captainIds.length) {
    await db.match.update({
      where: { id: matchId },
      data: { status: 'CANCELLED', endedAt: new Date() },
    })

    await Promise.all([
      redis.del(REDIS_KEYS.matchReadyState(matchId)),
      redis.del(REDIS_KEYS.matchVotingState(matchId)),
      redis.del(REDIS_KEYS.matchMvpVotingState(matchId)),
      redis.del(REDIS_KEYS.matchVetoState(matchId)),
      redis.del(REDIS_KEYS.matchCancelState(matchId)),
      redis.del(REDIS_KEYS.matchFinishState(matchId)),
    ])

    io.to(`match:${matchId}`).emit('match:cancelled', {
      reason: 'captains_cancelled',
      requestedBy: state.requestedBy,
    })
    void cleanupDiscordMatchVoiceNow(matchId, 'match_cancelled')
  }
}

async function openVoting(matchId: string, totalPlayers: number) {
  const current = await db.match.findUnique({ where: { id: matchId }, select: { status: true } })
  if (!current) throw Errors.NOT_FOUND('Match')
  if (current.status === 'VOTING' || current.status === 'COMPLETED') return
  if (current.status !== 'PLAYING') throw Errors.CONFLICT('Match is not in playing state')

  const votingState: VotingState = {
    expiresAt: Date.now() + VOTING_TIMEOUT_MS,
    totalPlayers,
    scheduledAt: Date.now(),
  }

  await db.match.update({
    where: { id: matchId },
    data: { status: 'VOTING' },
  })

  await redis.setex(
    REDIS_KEYS.matchVotingState(matchId),
    Math.ceil(VOTING_TIMEOUT_MS / 1000) + 30,
    JSON.stringify(votingState),
  )
  await redis.del(REDIS_KEYS.matchFinishState(matchId))

  const io = getIO()
  io.to(`match:${matchId}`).emit('vote:start', {
    expiresAt: votingState.expiresAt,
    totalPlayers,
    ...await getVoteCounts(matchId),
  })

  scheduleVotingTimeout(matchId, votingState.scheduledAt)
}

function scheduleVotingTimeout(matchId: string, scheduledAt: number) {
  const timeout = setTimeout(async () => {
    const votingRaw = await redis.get(REDIS_KEYS.matchVotingState(matchId))
    if (!votingRaw) return

    const votingState = JSON.parse(votingRaw) as VotingState
    if (votingState.scheduledAt !== scheduledAt) return

    const match = await db.match.findUnique({
      where: { id: matchId },
      include: { players: true },
    })
    if (!match || match.status !== 'VOTING') return

    const voteCounts = await getVoteCounts(matchId)
    const winnerTeam = await resolveWinnerOnTimeout(match.players, voteCounts)
    const humanPlayers = match.players.filter((entry) => !entry.isBot && entry.userId)
    await openMvpVoting(matchId, winnerTeam, humanPlayers.length, 'timeout')
  }, VOTING_TIMEOUT_MS + 500)
  timeout.unref?.()
}

async function openMvpVoting(
  matchId: string,
  winnerTeam: 1 | 2,
  totalPlayers: number,
  resolution: 'votes' | 'timeout' | 'replay',
) {
  const current = await db.match.findUnique({
    where: { id: matchId },
    select: { status: true, winner: true },
  })
  if (!current) throw Errors.NOT_FOUND('Match')
  if (current.status === 'COMPLETED') return
  if (current.status !== 'VOTING') throw Errors.CONFLICT('Winner voting is not open')

  const existingMvpVoting = await redis.get(REDIS_KEYS.matchMvpVotingState(matchId))
  if (existingMvpVoting) return

  await db.match.update({
    where: { id: matchId },
    data: { winner: winnerTeam },
  })

  const mvpVotingState: MvpVotingState = {
    expiresAt: Date.now() + MVP_VOTING_TIMEOUT_MS,
    totalPlayers,
    scheduledAt: Date.now(),
  }

  await redis.setex(
    REDIS_KEYS.matchMvpVotingState(matchId),
    Math.ceil(MVP_VOTING_TIMEOUT_MS / 1000) + 30,
    JSON.stringify(mvpVotingState),
  )

  const io = getIO()
  const voteCounts = await getVoteCounts(matchId)
  io.to(`match:${matchId}`).emit('vote:result', {
    winner: winnerTeam,
    resolution,
    ...voteCounts,
  })
  io.to(`match:${matchId}`).emit('mvp:start', {
    winner: winnerTeam,
    expiresAt: mvpVotingState.expiresAt,
    totalPlayers,
    counts: await getMvpVoteCounts(matchId),
  })

  scheduleMvpVotingTimeout(matchId, mvpVotingState.scheduledAt)
}

function scheduleMvpVotingTimeout(matchId: string, scheduledAt: number) {
  const timeout = setTimeout(async () => {
    const mvpVotingRaw = await redis.get(REDIS_KEYS.matchMvpVotingState(matchId))
    if (!mvpVotingRaw) return

    const mvpVotingState = JSON.parse(mvpVotingRaw) as MvpVotingState
    if (mvpVotingState.scheduledAt !== scheduledAt) return

    const match = await db.match.findUnique({
      where: { id: matchId },
      include: { players: true },
    })
    if (!match || match.status !== 'VOTING' || !match.winner) return

    const mvpUserId = await resolveMvpOnTimeout(matchId, match.players, match.winner as 1 | 2)
    await finalizeMatchWithMvp(matchId, mvpUserId, 'timeout')
  }, MVP_VOTING_TIMEOUT_MS + 500)
  timeout.unref?.()
}

async function resolveMvpOnTimeout(
  matchId: string,
  players: Array<{ userId: string | null; team: number; mmrBefore: number; isBot: boolean; isCaptain: boolean }>,
  winnerTeam: 1 | 2,
): Promise<string> {
  const counts = await getMvpVoteCounts(matchId)
  if (counts.length > 0) {
    const sorted = [...counts].sort((a, b) => b.votes - a.votes)
    const topVotes = sorted[0].votes
    const tied = sorted.filter((entry) => entry.votes === topVotes)
    if (tied.length === 1) return tied[0].nomineeUserId

    const tiedPlayer = tied
      .map((entry) => players.find((player) => player.userId === entry.nomineeUserId))
      .filter((player): player is NonNullable<typeof player> => Boolean(player))
      .sort((a, b) => {
        if (a.team !== b.team) return a.team === winnerTeam ? -1 : 1
        if (a.isCaptain !== b.isCaptain) return a.isCaptain ? -1 : 1
        return b.mmrBefore - a.mmrBefore
      })[0]
    if (tiedPlayer?.userId) return tiedPlayer.userId
  }

  const fallback = players
    .filter((player) => !player.isBot && player.userId)
    .sort((a, b) => {
      if (a.team !== b.team) return a.team === winnerTeam ? -1 : 1
      if (a.isCaptain !== b.isCaptain) return a.isCaptain ? -1 : 1
      return b.mmrBefore - a.mmrBefore
    })[0]

  if (!fallback?.userId) throw Errors.CONFLICT('No MVP candidates available')
  return fallback.userId
}

async function finalizeMatchWithMvp(
  matchId: string,
  mvpUserId: string,
  resolution: 'votes' | 'timeout',
) {
  const match = await db.match.findUnique({
    where: { id: matchId },
    select: { winner: true },
  })
  if (!match?.winner) throw Errors.CONFLICT('Winner must be resolved before MVP')

  await finalizeMatch(matchId, match.winner as 1 | 2, resolution, mvpUserId)
}

async function resolveWinnerOnTimeout(
  players: Array<{ team: number; mmrBefore: number; isCaptain: boolean }>,
  voteCounts: VoteCounts,
): Promise<1 | 2> {
  if (voteCounts.team1Votes > voteCounts.team2Votes) return 1
  if (voteCounts.team2Votes > voteCounts.team1Votes) return 2

  const team1 = players.filter((player) => player.team === 1)
  const team2 = players.filter((player) => player.team === 2)

  const team1Avg = team1.reduce((sum, player) => sum + player.mmrBefore, 0) / Math.max(1, team1.length)
  const team2Avg = team2.reduce((sum, player) => sum + player.mmrBefore, 0) / Math.max(1, team2.length)

  if (team1Avg === team2Avg) {
    return team1.some((player) => player.isCaptain) ? 1 : 2
  }

  return team1Avg > team2Avg ? 1 : 2
}

async function finalizeMatch(
  matchId: string,
  winnerTeam: 1 | 2,
  resolution: 'votes' | 'timeout',
  mvpUserId?: string,
) {
  const match = await db.match.findUnique({
    where: { id: matchId },
    include: { players: true },
  })
  if (!match) return
  if (match.status === 'COMPLETED') return

  const team1 = match.players.filter((player) => player.team === 1)
  const team2 = match.players.filter((player) => player.team === 2)

  const team1AvgMMR = team1.reduce((sum, player) => sum + player.mmrBefore, 0) / team1.length
  const team2AvgMMR = team2.reduce((sum, player) => sum + player.mmrBefore, 0) / team2.length

  const eloDeltas: Record<string, number> = {}
  const humanPlayers = match.players.filter((entry) => !entry.isBot && entry.userId)

  for (const player of humanPlayers) {
    const isWinner = player.team === winnerTeam
    const opponentAvgMMR = player.team === 1 ? team2AvgMMR : team1AvgMMR
    const k = getKFactor(player.mmrBefore)
    const expected = 1 / (1 + Math.pow(10, (opponentAvgMMR - player.mmrBefore) / 400))
    const score = isWinner ? 1 : 0
    const delta = Math.round(k * (score - expected))

    eloDeltas[player.userId as string] = delta

    await db.matchPlayer.update({
      where: { matchId_userId: { matchId, userId: player.userId as string } },
      data: { mmrAfter: player.mmrBefore + delta, mmrDelta: delta },
    })

    const newMMR = Math.max(0, player.mmrBefore + delta)
    const newRank = calculateRank(newMMR)

    await db.user.update({
      where: { id: player.userId as string },
      data: {
        mmr: newMMR,
        rank: newRank,
        wins: isWinner ? { increment: 1 } : undefined,
        losses: !isWinner ? { increment: 1 } : undefined,
      },
    })
  }

  const endedAt = new Date()
  const durationSeconds = match.startedAt
    ? Math.max(1, Math.round((endedAt.getTime() - match.startedAt.getTime()) / 1000))
    : null

  await db.match.update({
    where: { id: matchId },
    data: {
      status: 'COMPLETED',
      winner: winnerTeam,
      duration: durationSeconds,
      endedAt,
    },
  })

  if (mvpUserId) {
    await db.$executeRaw`
      UPDATE "Match" SET "mvpUserId" = ${mvpUserId} WHERE "id" = ${matchId}
    `
  }

  await Promise.all([
    redis.del(REDIS_KEYS.matchReadyState(matchId)),
      redis.del(REDIS_KEYS.matchVotingState(matchId)),
      redis.del(REDIS_KEYS.matchMvpVotingState(matchId)),
      redis.del(REDIS_KEYS.matchCancelState(matchId)),
      redis.del(REDIS_KEYS.matchFinishState(matchId)),
  ])

  const io = getIO()
  const voteCounts = await getVoteCounts(matchId)

  io.to(`match:${matchId}`).emit('vote:result', {
    winner: winnerTeam,
    resolution,
    ...voteCounts,
    eloDeltas,
  })
  io.to(`match:${matchId}`).emit('match:complete', {
    winner: winnerTeam,
    mvpUserId: mvpUserId ?? null,
    resolution,
    duration: durationSeconds,
    eloDeltas,
  })
  void cleanupDiscordMatchVoiceNow(matchId, 'match_completed')

  for (const player of humanPlayers) {
    const delta = eloDeltas[player.userId as string]
    const newMMR = Math.max(0, player.mmrBefore + delta)
    const newRank = calculateRank(newMMR)

    io.to(`user:${player.userId}`).emit('user:elo_update', {
      newMMR,
      delta,
      newRank,
      oldRank: calculateRank(player.mmrBefore),
    })
  }
}

async function getVoteCounts(matchId: string): Promise<VoteCounts> {
  const votes = await db.vote.groupBy({
    by: ['winner'],
    where: { matchId },
    _count: { winner: true },
  })

  const team1Votes = votes.find((vote) => vote.winner === 1)?._count.winner ?? 0
  const team2Votes = votes.find((vote) => vote.winner === 2)?._count.winner ?? 0

  return {
    team1Votes,
    team2Votes,
    total: team1Votes + team2Votes,
  }
}

async function getMvpVoteCounts(matchId: string): Promise<MvpVoteCount[]> {
  const votes = await db.$queryRaw<Array<{ nomineeUserId: string; votes: bigint }>>`
    SELECT "nomineeUserId", COUNT(*)::bigint AS votes
    FROM "MvpVote"
    WHERE "matchId" = ${matchId}
    GROUP BY "nomineeUserId"
    ORDER BY votes DESC
  `

  return votes.map((vote) => ({
    nomineeUserId: vote.nomineeUserId,
    votes: Number(vote.votes),
  }))
}

function getKFactor(mmr: number): number {
  if (mmr < 800) return 40
  if (mmr < 1200) return 35
  if (mmr < 1600) return 30
  if (mmr < 2000) return 25
  if (mmr < 2400) return 20
  if (mmr < 2800) return 16
  return 12
}

export { calculateRank }
