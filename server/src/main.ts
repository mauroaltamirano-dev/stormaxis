import 'dotenv/config'
import { createServer } from 'http'
import { createApp } from './infrastructure/http/app'
import { createSocketServer } from './infrastructure/socket/server'
import { db } from './infrastructure/database/client'
import { redis } from './infrastructure/redis/client'
import { scheduleTryFormMatch } from './modules/matchmaking/matchmaking.service'
import { logger } from './infrastructure/logging/logger'

const PORT = Number(process.env.PORT) || 3000

async function bootstrap() {
  // Verify DB connection
  await db.$connect()
  logger.info('PostgreSQL connected')

  // Verify Redis connection
  await redis.ping()
  logger.info('Redis connected')

  const app = createApp()
  const httpServer = createServer(app)
  createSocketServer(httpServer)

  httpServer.listen(PORT, () => {
    logger.info('NexusGG server running', { port: PORT })
  })

  // Recover matchmaking worker loop in case there are already users waiting in Redis
  await scheduleTryFormMatch()
}

bootstrap().catch((err) => {
  logger.error('Failed to start server', err)
  process.exit(1)
})
