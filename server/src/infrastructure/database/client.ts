import { Prisma, PrismaClient } from '@prisma/client'

declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined
}

const shouldLogQueries = process.env.PRISMA_QUERY_LOGS === 'true'
const prismaLogLevels: Prisma.LogLevel[] = shouldLogQueries ? ['query', 'error', 'warn'] : ['error', 'warn']

export const db = globalThis.__prisma ?? new PrismaClient({
  log: prismaLogLevels,
})

if (process.env.NODE_ENV !== 'production') {
  globalThis.__prisma = db
}
