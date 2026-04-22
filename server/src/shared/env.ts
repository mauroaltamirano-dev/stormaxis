import { z } from 'zod'

const EnvSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(3000),
    DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
    JWT_SECRET: z.string().min(1, 'JWT_SECRET is required'),
    JWT_REFRESH_SECRET: z.string().min(1, 'JWT_REFRESH_SECRET is required'),
    JWT_ACCESS_EXPIRY: z.string().default('15m'),
    CLIENT_URL: z.string().optional(),
    CLIENT_URLS: z.string().optional(),
    REDIS_URL: z.string().default('redis://localhost:6379'),
    DISCORD_CLIENT_ID: z.string().optional(),
    DISCORD_CLIENT_SECRET: z.string().optional(),
    DISCORD_REDIRECT_URI: z.string().optional(),
    DISCORD_BOT_TOKEN: z.string().optional(),
    DISCORD_GUILD_ID: z.string().optional(),
    DISCORD_STAFF_ROLE_ID: z.string().optional(),
    DISCORD_MATCH_CATEGORY_PARENT_ID: z.string().optional(),
    DISCORD_MATCH_CHANNEL_TTL_MINUTES: z.coerce.number().int().positive().default(180),
  })
  .superRefine((env, ctx) => {
    const hasDiscordId = Boolean(env.DISCORD_CLIENT_ID)
    const hasDiscordSecret = Boolean(env.DISCORD_CLIENT_SECRET)

    if (hasDiscordId !== hasDiscordSecret) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['DISCORD_CLIENT_ID'],
        message: 'DISCORD_CLIENT_ID and DISCORD_CLIENT_SECRET must be set together',
      })
    }

    const hasDiscordVoiceVars = Boolean(env.DISCORD_BOT_TOKEN || env.DISCORD_GUILD_ID || env.DISCORD_STAFF_ROLE_ID)
    if (hasDiscordVoiceVars) {
      if (!env.DISCORD_BOT_TOKEN || !env.DISCORD_GUILD_ID || !env.DISCORD_STAFF_ROLE_ID) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['DISCORD_BOT_TOKEN'],
          message: 'DISCORD_BOT_TOKEN, DISCORD_GUILD_ID and DISCORD_STAFF_ROLE_ID must be set together',
        })
      }
    }
  })

export function validateEnv() {
  const parsed = EnvSchema.safeParse(process.env)
  if (parsed.success) return parsed.data

  const message = parsed.error.issues
    .map((issue) => {
      const path = issue.path.join('.') || 'env'
      return `${path}: ${issue.message}`
    })
    .join('; ')

  throw new Error(`Invalid environment variables: ${message}`)
}
