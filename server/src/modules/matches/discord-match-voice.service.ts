import { db } from '../../infrastructure/database/client'
import { redis, REDIS_KEYS } from '../../infrastructure/redis/client'
import { logger } from '../../infrastructure/logging/logger'

const DISCORD_API_BASE = 'https://discord.com/api/v10'
const DISCORD_VOICE_ALLOW = '3146752' // VIEW_CHANNEL + CONNECT + SPEAK
const MATCH_VOICE_META_TTL_SECONDS = 7 * 24 * 60 * 60

type DiscordOverwrite = {
  id: string
  type: 0 | 1
  allow?: string
  deny?: string
}

type DiscordChannelResponse = {
  id: string
}

type DiscordInviteResponse = {
  code: string
}

type DiscordMatchVoiceMeta = {
  guildId: string
  categoryId: string
  team1ChannelId: string
  team2ChannelId: string
  team1InviteUrl: string
  team2InviteUrl: string
  createdAt: number
  cleanupScheduledAt: number | null
  cleanedAt: number | null
}

type DiscordVoiceAccess = {
  enabled: boolean
  status:
    | 'disabled'
    | 'spectator'
    | 'missing_link'
    | 'pending'
    | 'ready'
  hasLinkedDiscord: boolean
  team: 1 | 2 | null
  teamInviteUrl: string | null
}

function getMatchVoiceConfig() {
  const botToken = process.env.DISCORD_BOT_TOKEN?.trim() || ''
  const guildId = process.env.DISCORD_GUILD_ID?.trim() || ''
  const staffRoleId = process.env.DISCORD_STAFF_ROLE_ID?.trim() || ''
  const categoryParentId = process.env.DISCORD_MATCH_CATEGORY_PARENT_ID?.trim() || undefined
  const ttlMinutesRaw = Number(process.env.DISCORD_MATCH_CHANNEL_TTL_MINUTES ?? 180)
  const ttlMinutes = Number.isFinite(ttlMinutesRaw) && ttlMinutesRaw > 0
    ? Math.round(ttlMinutesRaw)
    : 180

  const enabled = Boolean(botToken && guildId && staffRoleId)

  return {
    enabled,
    botToken,
    guildId,
    staffRoleId,
    categoryParentId,
    ttlMinutes,
  }
}

function redisKey(matchId: string) {
  return REDIS_KEYS.discordMatchVoice(matchId)
}

async function discordRequest<T>(
  path: string,
  init: RequestInit,
  botToken: string,
): Promise<T> {
  const response = await fetch(`${DISCORD_API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bot ${botToken}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  })

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(`Discord API ${path} failed (${response.status}): ${text.slice(0, 400)}`)
  }

  if (response.status === 204) return {} as T
  return (await response.json()) as T
}

async function createChannel(
  botToken: string,
  guildId: string,
  payload: Record<string, unknown>,
) {
  return discordRequest<DiscordChannelResponse>(`/guilds/${guildId}/channels`, {
    method: 'POST',
    body: JSON.stringify(payload),
  }, botToken)
}

async function createInvite(
  botToken: string,
  channelId: string,
  ttlMinutes: number,
) {
  const invite = await discordRequest<DiscordInviteResponse>(`/channels/${channelId}/invites`, {
    method: 'POST',
    body: JSON.stringify({
      max_age: ttlMinutes * 60,
      max_uses: 0,
      temporary: false,
      unique: true,
    }),
  }, botToken)

  return `https://discord.gg/${invite.code}`
}

async function deleteChannel(botToken: string, channelId: string) {
  await discordRequest(`/channels/${channelId}`, { method: 'DELETE' }, botToken)
}

async function loadMeta(matchId: string): Promise<DiscordMatchVoiceMeta | null> {
  const raw = await redis.get(redisKey(matchId))
  if (!raw) return null
  try {
    return JSON.parse(raw) as DiscordMatchVoiceMeta
  } catch {
    return null
  }
}

async function saveMeta(matchId: string, meta: DiscordMatchVoiceMeta) {
  await redis.setex(redisKey(matchId), MATCH_VOICE_META_TTL_SECONDS, JSON.stringify(meta))
}

export async function ensureDiscordMatchVoice(matchId: string): Promise<DiscordMatchVoiceMeta | null> {
  const config = getMatchVoiceConfig()
  if (!config.enabled) return null

  const existing = await loadMeta(matchId)
  if (existing?.categoryId && existing.cleanedAt == null) {
    return existing
  }

  const match = await db.match.findUnique({
    where: { id: matchId },
    include: {
      players: {
        include: {
          user: { select: { discordId: true } },
        },
      },
    },
  })
  if (!match) return null

  const team1DiscordIds = match.players
    .filter((player) => !player.isBot && player.team === 1)
    .map((player) => player.user?.discordId ?? null)
    .filter((discordId): discordId is string => Boolean(discordId))
  const team2DiscordIds = match.players
    .filter((player) => !player.isBot && player.team === 2)
    .map((player) => player.user?.discordId ?? null)
    .filter((discordId): discordId is string => Boolean(discordId))

  const everyoneDeny: DiscordOverwrite = {
    id: config.guildId,
    type: 0,
    deny: DISCORD_VOICE_ALLOW,
  }
  const staffAllow: DiscordOverwrite = {
    id: config.staffRoleId,
    type: 0,
    allow: DISCORD_VOICE_ALLOW,
  }

  let categoryId: string | null = null
  let team1ChannelId: string | null = null
  let team2ChannelId: string | null = null

  try {
    const category = await createChannel(config.botToken, config.guildId, {
      name: `match-${match.id.slice(-8)}`,
      type: 4,
      parent_id: config.categoryParentId,
      permission_overwrites: [everyoneDeny, staffAllow],
    })
    categoryId = category.id

    const team1Overwrites: DiscordOverwrite[] = [
      everyoneDeny,
      staffAllow,
      ...team1DiscordIds.map((discordId) => ({
        id: discordId,
        type: 1 as const,
        allow: DISCORD_VOICE_ALLOW,
      })),
    ]
    const team2Overwrites: DiscordOverwrite[] = [
      everyoneDeny,
      staffAllow,
      ...team2DiscordIds.map((discordId) => ({
        id: discordId,
        type: 1 as const,
        allow: DISCORD_VOICE_ALLOW,
      })),
    ]

    const [team1Channel, team2Channel] = await Promise.all([
      createChannel(config.botToken, config.guildId, {
        name: `team-azul-${match.id.slice(-4)}`,
        type: 2,
        parent_id: categoryId,
        permission_overwrites: team1Overwrites,
        user_limit: 5,
      }),
      createChannel(config.botToken, config.guildId, {
        name: `team-rojo-${match.id.slice(-4)}`,
        type: 2,
        parent_id: categoryId,
        permission_overwrites: team2Overwrites,
        user_limit: 5,
      }),
    ])
    team1ChannelId = team1Channel.id
    team2ChannelId = team2Channel.id

    const [team1InviteUrl, team2InviteUrl] = await Promise.all([
      createInvite(config.botToken, team1Channel.id, config.ttlMinutes),
      createInvite(config.botToken, team2Channel.id, config.ttlMinutes),
    ])

    const meta: DiscordMatchVoiceMeta = {
      guildId: config.guildId,
      categoryId,
      team1ChannelId: team1Channel.id,
      team2ChannelId: team2Channel.id,
      team1InviteUrl,
      team2InviteUrl,
      createdAt: Date.now(),
      cleanupScheduledAt: null,
      cleanedAt: null,
    }
    await saveMeta(matchId, meta)

    logger.info('Discord match voice created', {
      matchId,
      categoryId: meta.categoryId,
      team1Linked: team1DiscordIds.length,
      team2Linked: team2DiscordIds.length,
    })

    return meta
  } catch (err) {
    await Promise.allSettled([
      team1ChannelId ? deleteChannel(config.botToken, team1ChannelId) : Promise.resolve(),
      team2ChannelId ? deleteChannel(config.botToken, team2ChannelId) : Promise.resolve(),
      categoryId ? deleteChannel(config.botToken, categoryId) : Promise.resolve(),
    ])
    throw err
  }
}

export async function getDiscordVoiceAccessForUser(
  matchId: string,
  userId: string,
): Promise<DiscordVoiceAccess> {
  const config = getMatchVoiceConfig()
  if (!config.enabled) {
    return {
      enabled: false,
      status: 'disabled',
      hasLinkedDiscord: false,
      team: null,
      teamInviteUrl: null,
    }
  }

  const participant = await db.matchPlayer.findFirst({
    where: { matchId, userId, isBot: false },
    include: { user: { select: { discordId: true } } },
  })
  if (!participant) {
    return {
      enabled: true,
      status: 'spectator',
      hasLinkedDiscord: false,
      team: null,
      teamInviteUrl: null,
    }
  }

  const hasLinkedDiscord = Boolean(participant.user?.discordId)
  if (!hasLinkedDiscord) {
    return {
      enabled: true,
      status: 'missing_link',
      hasLinkedDiscord: false,
      team: participant.team as 1 | 2,
      teamInviteUrl: null,
    }
  }

  const meta = await loadMeta(matchId)
  if (!meta || meta.cleanedAt) {
    return {
      enabled: true,
      status: 'pending',
      hasLinkedDiscord: true,
      team: participant.team as 1 | 2,
      teamInviteUrl: null,
    }
  }

  return {
    enabled: true,
    status: 'ready',
    hasLinkedDiscord: true,
    team: participant.team as 1 | 2,
    teamInviteUrl: participant.team === 1 ? meta.team1InviteUrl : meta.team2InviteUrl,
  }
}

export async function scheduleDiscordMatchVoiceCleanup(
  matchId: string,
  reason: 'match_completed' | 'match_cancelled',
) {
  const config = getMatchVoiceConfig()
  if (!config.enabled) return

  const meta = await loadMeta(matchId)
  if (!meta || meta.cleanedAt) return
  if (meta.cleanupScheduledAt) return

  const cleanupScheduledAt = Date.now() + config.ttlMinutes * 60 * 1000
  const updatedMeta: DiscordMatchVoiceMeta = { ...meta, cleanupScheduledAt }
  await saveMeta(matchId, updatedMeta)

  setTimeout(async () => {
    const latest = await loadMeta(matchId)
    if (!latest || latest.cleanedAt) return

    try {
      await Promise.allSettled([
        deleteChannel(config.botToken, latest.team1ChannelId),
        deleteChannel(config.botToken, latest.team2ChannelId),
      ])
      await deleteChannel(config.botToken, latest.categoryId)

      await saveMeta(matchId, {
        ...latest,
        cleanedAt: Date.now(),
      })

      logger.info('Discord match voice cleaned', { matchId, reason })
    } catch (err) {
      logger.warn('Discord match voice cleanup failed', {
        matchId,
        reason,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }, Math.max(1000, cleanupScheduledAt - Date.now()))
}
