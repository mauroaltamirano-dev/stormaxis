import Redis from 'ioredis'
import { logger } from '../logging/logger'

export const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
  lazyConnect: true,
})

redis.on('error', (err) => {
  logger.error('Redis error', err)
})

// Keys helpers — centralized to avoid typos across the codebase
export const REDIS_KEYS = {
  matchmakingQueue: (region: string) => `queue:${region}`,
  matchmakingScheduleLock: (region: string) => `queue_schedule:${region}`,
  matchmakingLastFormedAt: (region: string) => `queue_formed_last:${region}`,
  matchmakingCycleHistory: (region: string) => `queue_cycle_history:${region}`,
  matchmakingWaitHistory: (region: string) => `queue_wait_history:${region}`,
  pendingMatch: (matchId: string) => `pending_match:${matchId}`,
  matchVetoState: (matchId: string) => `veto:${matchId}`,
  matchReadyState: (matchId: string) => `match_ready:${matchId}`,
  matchVotingState: (matchId: string) => `match_voting:${matchId}`,
  matchMvpVotingState: (matchId: string) => `match_mvp_voting:${matchId}`,
  matchFinishState: (matchId: string) => `match_finish:${matchId}`,
  matchCancelState: (matchId: string) => `match_cancel:${matchId}`,
  discordMatchVoice: (matchId: string) => `match_discord_voice:${matchId}`,
  userInQueue: (userId: string) => `user_queue:${userId}`,
  rateLimitQueue: (userId: string) => `rl:queue:${userId}`,
  clientErrorEvents: () => 'client_error_events',
} as const
