import { z } from 'zod'

function emptyStringToUndefined(value: unknown) {
  return typeof value === 'string' && value.trim() === '' ? undefined : value
}

const OptionalUrlString = z.preprocess(emptyStringToUndefined, z.string().trim().url().optional())
const OptionalNonEmptyString = z.preprocess(emptyStringToUndefined, z.string().trim().min(1).optional())
const OptionalTrimmedString = z.preprocess(emptyStringToUndefined, z.string().trim().optional())
const BooleanString = z.preprocess(emptyStringToUndefined, z.enum(['true', 'false']).optional())

const BattleNetRegionSchema = z
  .string()
  .trim()
  .toLowerCase()
  .default('us')
  .refine(
    (region) =>
      [
        'us',
        'eu',
        'kr',
        'tw',
        'cn',
        'americas',
        'america',
        'latam',
        'latin-america',
        'south-america',
        'southamerica',
        'sa',
        'br',
      ].includes(region),
    'BNET_REGION must be one of us, eu, kr, tw, cn or a supported Americas alias',
  )

const EnvSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(3000),
    DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
    JWT_SECRET: z.string().min(1, 'JWT_SECRET is required'),
    JWT_REFRESH_SECRET: z.string().min(1, 'JWT_REFRESH_SECRET is required'),
    JWT_ACCESS_EXPIRY: z.string().default('15m'),
    CLIENT_URL: OptionalUrlString,
    CLIENT_URLS: OptionalNonEmptyString,
    REDIS_URL: z.string().trim().min(1).default('redis://localhost:6379'),

    DISCORD_CLIENT_ID: OptionalNonEmptyString,
    DISCORD_CLIENT_SECRET: OptionalNonEmptyString,
    DISCORD_REDIRECT_URI: OptionalUrlString,
    DISCORD_BOT_TOKEN: OptionalNonEmptyString,
    DISCORD_GUILD_ID: OptionalNonEmptyString,
    DISCORD_STAFF_ROLE_ID: OptionalNonEmptyString,
    DISCORD_MATCH_CATEGORY_PARENT_ID: OptionalNonEmptyString,
    DISCORD_MATCH_CHANNEL_TTL_MINUTES: z.coerce.number().int().positive().default(180),

    BNET_CLIENT_ID: OptionalNonEmptyString,
    BNET_CLIENT_SECRET: OptionalNonEmptyString,
    BNET_REGION: BattleNetRegionSchema,
    BNET_REDIRECT_URI: OptionalUrlString,
    BNET_OAUTH_SCOPES: z.string().trim().min(1).default('openid'),

    REPLAY_RAW_RETENTION: z.enum(['delete_after_parse', 'keep']).default('delete_after_parse'),
    REPLAY_STORAGE_DRIVER: z.enum(['local', 'r2', 's3']).default('local'),
    REPLAY_UPLOAD_DIR: OptionalNonEmptyString,
    REPLAY_STORAGE_BUCKET: OptionalNonEmptyString,
    REPLAY_STORAGE_ENDPOINT: OptionalUrlString,
    REPLAY_STORAGE_REGION: z.string().trim().min(1).optional(),
    REPLAY_STORAGE_ACCESS_KEY_ID: OptionalNonEmptyString,
    REPLAY_STORAGE_SECRET_ACCESS_KEY: OptionalNonEmptyString,
    REPLAY_STORAGE_PREFIX: OptionalTrimmedString,
    REPLAY_STORAGE_FORCE_PATH_STYLE: BooleanString,
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

    const hasBattleNetId = Boolean(env.BNET_CLIENT_ID)
    const hasBattleNetSecret = Boolean(env.BNET_CLIENT_SECRET)
    if (hasBattleNetId !== hasBattleNetSecret) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['BNET_CLIENT_ID'],
        message: 'BNET_CLIENT_ID and BNET_CLIENT_SECRET must be set together',
      })
    }

    if (env.NODE_ENV === 'production' && hasBattleNetId && !env.BNET_REDIRECT_URI) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['BNET_REDIRECT_URI'],
        message: 'BNET_REDIRECT_URI is required in production when Battle.net OAuth is enabled',
      })
    }

    if (env.NODE_ENV === 'production' && hasDiscordId && !env.DISCORD_REDIRECT_URI) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['DISCORD_REDIRECT_URI'],
        message: 'DISCORD_REDIRECT_URI is required in production when Discord OAuth is enabled',
      })
    }

    const keepsRawReplay = env.REPLAY_RAW_RETENTION === 'keep'
    const usesObjectStorage = env.REPLAY_STORAGE_DRIVER === 'r2' || env.REPLAY_STORAGE_DRIVER === 's3'

    if (keepsRawReplay && usesObjectStorage) {
      const requiredReplayStorageVars = [
        'REPLAY_STORAGE_BUCKET',
        'REPLAY_STORAGE_ACCESS_KEY_ID',
        'REPLAY_STORAGE_SECRET_ACCESS_KEY',
      ] as const

      for (const name of requiredReplayStorageVars) {
        if (!env[name]) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [name],
            message: `${name} is required when REPLAY_RAW_RETENTION=keep and REPLAY_STORAGE_DRIVER=${env.REPLAY_STORAGE_DRIVER}`,
          })
        }
      }

      if (env.REPLAY_STORAGE_DRIVER === 'r2' && !env.REPLAY_STORAGE_ENDPOINT) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['REPLAY_STORAGE_ENDPOINT'],
          message: 'REPLAY_STORAGE_ENDPOINT is required when storing raw replays in Cloudflare R2',
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
