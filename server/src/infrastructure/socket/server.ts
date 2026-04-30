import { Server as HttpServer } from 'http'
import { Server as SocketServer } from 'socket.io'
import { verifyAccessToken } from '../../modules/auth/auth.service'
import { registerMatchHandlers } from '../../modules/matches/match.socket'
import { registerMatchmakingHandlers } from '../../modules/matchmaking/matchmaking.socket'

let io: SocketServer

function resolveAllowedOrigins() {
  const raw = process.env.CLIENT_URLS || process.env.CLIENT_URL || 'http://localhost:5173'
  return raw.split(',').map((origin) => origin.trim()).filter(Boolean)
}

function isDevLanOrigin(origin: string) {
  return /^http:\/\/(localhost|127\.0\.0\.1|\d{1,3}(?:\.\d{1,3}){3})(:\d+)?$/.test(origin)
}

export function createSocketServer(httpServer: HttpServer) {
  const allowedOrigins = resolveAllowedOrigins()

  io = new SocketServer(httpServer, {
    path: '/socket.io',
    cors: {
      origin: (origin, callback) => {
        if (!origin) return callback(null, true)
        if (allowedOrigins.includes(origin)) return callback(null, true)
        if (process.env.NODE_ENV !== 'production' && isDevLanOrigin(origin)) return callback(null, true)
        return callback(new Error(`Socket origin not allowed: ${origin}`))
      },
      credentials: true,
    },
    connectionStateRecovery: {
      maxDisconnectionDuration: 2 * 60_000,
      skipMiddlewares: false,
    },
    pingTimeout: 20000,
    pingInterval: 10000,
  })

  // Auth middleware — every socket connection must have a valid JWT
  io.use(async (socket, next) => {
    const token = socket.handshake.auth.token as string | undefined

    if (!token) {
      return next(new Error('UNAUTHORIZED'))
    }

    const payload = verifyAccessToken(token)
    if (!payload) {
      return next(new Error('INVALID_TOKEN'))
    }

    socket.data.userId = payload.sub
    socket.data.role = payload.role
    next()
  })

  io.on('connection', (socket) => {
    const userId = socket.data.userId as string

    // Join personal room for user-specific events
    socket.join(`user:${userId}`)

    console.log(`Socket connected: ${userId}`)

    registerMatchmakingHandlers(io, socket)
    registerMatchHandlers(io, socket)

    socket.on('disconnect', () => {
      console.log(`Socket disconnected: ${userId}`)
    })
  })

  console.log('✓ Socket.io server initialized')
  return io
}

export async function getOnlineUserIds() {
  if (!io) return new Set<string>()
  const sockets = await io.fetchSockets()
  return new Set(
    sockets
      .map((socket) => socket.data.userId as string | undefined)
      .filter((userId): userId is string => Boolean(userId)),
  )
}

export function getIO() {
  if (!io) throw new Error('Socket.io not initialized')
  return io
}
