import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import cookieParser from 'cookie-parser'
import { rateLimit } from 'express-rate-limit'
import { errorHandler } from '../../shared/errors/handler'
import { authRouter } from '../../modules/auth/auth.router'
import { usersRouter } from '../../modules/users/users.router'
import { matchmakingRouter } from '../../modules/matchmaking/matchmaking.router'
import { matchesRouter } from '../../modules/matches/matches.router'
import { leaderboardRouter } from '../../modules/leaderboard/leaderboard.router'
import { adminRouter } from '../../modules/admin/admin.router'
import { redis, REDIS_KEYS } from '../redis/client'
import { logger } from '../logging/logger'

function resolveAllowedOrigins() {
  const raw = process.env.CLIENT_URLS || process.env.CLIENT_URL || 'http://localhost:5173'
  return raw.split(',').map((origin) => origin.trim()).filter(Boolean)
}

function isDevLanOrigin(origin: string) {
  return /^http:\/\/(localhost|127\.0\.0\.1|\d{1,3}(?:\.\d{1,3}){3})(:\d+)?$/.test(origin)
}

export function createApp() {
  const app = express()
  const allowedOrigins = resolveAllowedOrigins()

  // Vite dev proxy, Cloudflare quick tunnels and most deployment proxies set
  // X-Forwarded-For. Trust only loopback by default so local proxies can pass
  // the real client IP without allowing arbitrary direct spoofing.
  app.set('trust proxy', process.env.TRUST_PROXY || 'loopback')

  // Security
  app.use(
    helmet({
      crossOriginEmbedderPolicy: false,
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          connectSrc: ["'self'", 'wss:', 'https://discord.com', 'https://battle.net'],
          imgSrc: ["'self'", 'data:', 'https:', 'http:'],
        },
      },
    }),
  )

  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin) return callback(null, true)
        if (allowedOrigins.includes(origin)) return callback(null, true)
        if (process.env.NODE_ENV !== 'production' && isDevLanOrigin(origin)) return callback(null, true)
        return callback(new Error(`CORS origin not allowed: ${origin}`))
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    }),
  )

  // Matchmaking polling limiter (más permisivo para fallback de realtime)
  const matchmakingPollingLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 2000,
    standardHeaders: true,
    legacyHeaders: false,
  })

  app.use('/api/matchmaking/active', matchmakingPollingLimiter)
  app.use('/api/matchmaking/queue/snapshot', matchmakingPollingLimiter)

  const clientErrorLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 60,
    standardHeaders: true,
    legacyHeaders: false,
  })

  // Global rate limit (deja fuera endpoints de polling de matchmaking)
  app.use(
    rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 600,
      standardHeaders: true,
      legacyHeaders: false,
      skip: (req) =>
        req.path === '/api/matchmaking/active' ||
        req.path === '/api/matchmaking/queue/snapshot',
    }),
  )

  // Body parsing
  app.use(express.json({ limit: '10kb' }))
  app.use(cookieParser())

  // Health check
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', service: 'nexusgg-api' })
  })

  // Client runtime monitoring
  app.post('/api/client-errors', clientErrorLimiter, (req, res) => {
    const body = req.body as {
      message?: unknown
      stack?: unknown
      context?: unknown
      url?: unknown
      userAgent?: unknown
      timestamp?: unknown
    } | undefined

    const message = typeof body?.message === 'string' ? body.message.slice(0, 500) : 'Unknown client error'
    const stack = typeof body?.stack === 'string' ? body.stack.slice(0, 4_000) : null
    const context = typeof body?.context === 'string' ? body.context.slice(0, 300) : null
    const url = typeof body?.url === 'string' ? body.url.slice(0, 500) : null
    const userAgent = typeof body?.userAgent === 'string' ? body.userAgent.slice(0, 500) : null
    const timestamp = typeof body?.timestamp === 'string' ? body.timestamp : new Date().toISOString()

    const event = {
      message,
      stack,
      context,
      url,
      userAgent,
      timestamp,
      ip: req.ip,
      createdAt: new Date().toISOString(),
    }

    logger.error('Client runtime error reported', event)

    void redis
      .multi()
      .lpush(REDIS_KEYS.clientErrorEvents(), JSON.stringify(event))
      .ltrim(REDIS_KEYS.clientErrorEvents(), 0, 199)
      .exec()
      .catch((err) => {
        logger.warn('Failed to persist client error event', err)
      })

    res.status(202).json({ ok: true })
  })

  // Routes
  app.use('/api/auth', authRouter)
  app.use('/api/users', usersRouter)
  app.use('/api/matchmaking', matchmakingRouter)
  app.use('/api/matches', matchesRouter)
  app.use('/api/leaderboard', leaderboardRouter)
  app.use('/api/admin', adminRouter)

  // Error handler (must be last)
  app.use(errorHandler)

  return app
}
