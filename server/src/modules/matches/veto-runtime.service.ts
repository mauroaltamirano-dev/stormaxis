import { HOTS_MAPS } from '@nexusgg/shared'
import { db } from '../../infrastructure/database/client'
import { redis, REDIS_KEYS } from '../../infrastructure/redis/client'
import { getIO } from '../../infrastructure/socket/server'
import { Errors } from '../../shared/errors/AppError'

type TeamId = 1 | 2

export type MatchVetoState = {
  remainingMaps: string[]
  currentTurn: TeamId
  vetoOrder: TeamId[]
  vetoIndex: number
  timeoutAt: number
  captains: Record<TeamId, string>
}

export type InitializeMatchVetoOptions = {
  timeoutMs: number
  emit?: boolean
}

export async function initializeMatchVeto(matchId: string, options: InitializeMatchVetoOptions) {
  await redis.del(REDIS_KEYS.pendingMatch(matchId))

  const match = await db.match.update({
    where: { id: matchId },
    data: { status: 'VETOING' },
    include: { players: { where: { isCaptain: true } } },
  })

  const vetoOrder = Array.from(
    { length: Math.max(0, HOTS_MAPS.length - 1) },
    (_, index) => (index % 2 === 0 ? 1 : 2) as TeamId,
  )
  const timeoutAt = Date.now() + options.timeoutMs
  const vetoState: MatchVetoState = {
    remainingMaps: HOTS_MAPS.map((m) => m.id),
    currentTurn: vetoOrder[0] ?? 1,
    vetoOrder,
    vetoIndex: 0,
    timeoutAt,
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

  if (options.emit !== false) {
    const io = getIO()
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
  }

  return { match, vetoState, timeoutAt }
}
