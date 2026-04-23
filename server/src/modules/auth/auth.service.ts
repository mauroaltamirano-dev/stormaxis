import jwt from 'jsonwebtoken'
import bcrypt from 'bcrypt'
import { randomUUID } from 'crypto'
import { db } from '../../infrastructure/database/client'
import { Errors } from '../../shared/errors/AppError'

const ACCESS_SECRET = process.env.JWT_SECRET!
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET!
const ACCESS_EXPIRY = (process.env.JWT_ACCESS_EXPIRY || '15m') as string
const REFRESH_EXPIRY_DAYS = 30

interface TokenPayload {
  sub: string
  role: string
  iat: number
  exp: number
}

// ─── Token helpers ────────────────────────────────────────

export function signAccessToken(userId: string, role: string): string {
  return jwt.sign({ sub: userId, role }, ACCESS_SECRET, { expiresIn: ACCESS_EXPIRY } as jwt.SignOptions)
}

export function signRefreshToken(userId: string): { token: string; jti: string } {
  const jti = randomUUID()
  const token = jwt.sign({ sub: userId, jti }, REFRESH_SECRET, {
    expiresIn: `${REFRESH_EXPIRY_DAYS}d`,
  } as jwt.SignOptions)
  return { token, jti }
}

export function verifyAccessToken(token: string): TokenPayload | null {
  try {
    return jwt.verify(token, ACCESS_SECRET) as TokenPayload
  } catch {
    return null
  }
}

export function verifyRefreshToken(token: string): { sub: string; jti: string } | null {
  try {
    return jwt.verify(token, REFRESH_SECRET) as { sub: string; jti: string }
  } catch {
    return null
  }
}

// ─── Auth operations ──────────────────────────────────────

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12)
}

export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash)
}

export async function saveRefreshToken(userId: string, jti: string) {
  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + REFRESH_EXPIRY_DAYS)

  await db.refreshToken.create({
    data: { jti, userId, expiresAt },
  })
}

export async function rotateRefreshToken(
  oldJti: string,
  userId: string,
): Promise<{ accessToken: string; refreshToken: string; jti: string }> {
  // Invalidate the old one
  const old = await db.refreshToken.findUnique({ where: { jti: oldJti } })
  if (!old || old.isRevoked || old.expiresAt < new Date()) {
    throw Errors.UNAUTHORIZED()
  }

  await db.refreshToken.update({ where: { jti: oldJti }, data: { isRevoked: true } })

  const user = await db.user.findUnique({ where: { id: userId }, select: { id: true, role: true } })
  if (!user) throw Errors.UNAUTHORIZED()

  const accessToken = signAccessToken(user.id, user.role)
  const { token: refreshToken, jti } = signRefreshToken(user.id)
  await saveRefreshToken(user.id, jti)

  return { accessToken, refreshToken, jti }
}

export async function revokeRefreshToken(jti: string) {
  await db.refreshToken.updateMany({
    where: { jti },
    data: { isRevoked: true },
  })
}

// ─── Discord OAuth helpers ───────────────────────────────

interface DiscordTokenResponse {
  access_token: string
  token_type: string
  scope: string
}

export interface DiscordProfile {
  id: string
  username: string
  global_name: string | null
  avatar: string | null
  email: string | null
  verified: boolean
}

const DISCORD_API_BASE = 'https://discord.com/api/v10'

export function isDiscordConfigured() {
  return Boolean(process.env.DISCORD_CLIENT_ID && process.env.DISCORD_CLIENT_SECRET)
}

export function getClientUrl() {
  const fromList = process.env.CLIENT_URLS
    ?.split(',')
    .map((origin) => origin.trim())
    .find(Boolean)
  if (fromList) return fromList

  const preferred = process.env.CLIENT_URL
  if (preferred) return preferred

  return 'http://localhost:5173'
}

export function getDiscordRedirectUri(override?: string) {
  const fallbackPort = process.env.PORT || '3000'
  return override || process.env.DISCORD_REDIRECT_URI || `http://localhost:${fallbackPort}/api/auth/discord/callback`
}

export function getDiscordAuthorizeUrl(state: string, redirectUri?: string) {
  if (!isDiscordConfigured()) throw Errors.INTERNAL()

  const params = new URLSearchParams({
    client_id: process.env.DISCORD_CLIENT_ID!,
    response_type: 'code',
    redirect_uri: getDiscordRedirectUri(redirectUri),
    scope: 'identify email',
    state,
    prompt: 'consent',
  })

  return `${DISCORD_API_BASE}/oauth2/authorize?${params.toString()}`
}

export async function exchangeDiscordCode(code: string, redirectUri?: string): Promise<DiscordTokenResponse> {
  if (!isDiscordConfigured()) throw Errors.INTERNAL()

  const body = new URLSearchParams({
    client_id: process.env.DISCORD_CLIENT_ID!,
    client_secret: process.env.DISCORD_CLIENT_SECRET!,
    grant_type: 'authorization_code',
    code,
    redirect_uri: getDiscordRedirectUri(redirectUri),
  })

  const response = await fetch(`${DISCORD_API_BASE}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })

  if (!response.ok) {
    throw Errors.UNAUTHORIZED()
  }

  return response.json() as Promise<DiscordTokenResponse>
}

export async function fetchDiscordProfile(accessToken: string): Promise<DiscordProfile> {
  const response = await fetch(`${DISCORD_API_BASE}/users/@me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  if (!response.ok) {
    throw Errors.UNAUTHORIZED()
  }

  return response.json() as Promise<DiscordProfile>
}

export function getDiscordAvatarUrl(profile: Pick<DiscordProfile, 'id' | 'avatar'>) {
  if (!profile.avatar) return null
  return `https://cdn.discordapp.com/avatars/${profile.id}/${profile.avatar}.png?size=256`
}

export function getDiscordCreatedAt(discordId: string) {
  const discordEpoch = 1420070400000n
  const timestamp = Number((BigInt(discordId) >> 22n) + discordEpoch)
  return new Date(timestamp)
}

// ─── Battle.net OAuth helpers ───────────────────────────

interface BattleNetTokenResponse {
  access_token: string
  token_type: string
  expires_in?: number
  scope?: string
}

export interface BattleNetProfile {
  sub?: string
  id?: string | number
  battletag?: string
}

export function isBattleNetConfigured() {
  return Boolean(process.env.BNET_CLIENT_ID && process.env.BNET_CLIENT_SECRET)
}

function getBattleNetRegion() {
  const region = (process.env.BNET_REGION || 'us').trim().toLowerCase()

  // Battle.net groups Latin America/South America under the Americas OAuth host.
  if (['americas', 'america', 'latam', 'latin-america', 'south-america', 'southamerica', 'sa', 'br'].includes(region)) {
    return 'us'
  }

  return region
}

function getBattleNetOAuthBase() {
  const region = getBattleNetRegion()
  if (region === 'cn') return 'https://www.battlenet.com.cn'
  return `https://${region}.battle.net`
}

export function getBattleNetRedirectUri(override?: string) {
  const fallbackPort = process.env.PORT || '3000'
  return override || process.env.BNET_REDIRECT_URI || `http://localhost:${fallbackPort}/api/auth/bnet/callback`
}

export function getBattleNetAuthorizeUrl(state: string, redirectUri?: string) {
  if (!isBattleNetConfigured()) throw Errors.INTERNAL()

  const params = new URLSearchParams({
    client_id: process.env.BNET_CLIENT_ID!,
    response_type: 'code',
    redirect_uri: getBattleNetRedirectUri(redirectUri),
    scope: process.env.BNET_OAUTH_SCOPES || 'openid',
    state,
  })

  return `${getBattleNetOAuthBase()}/oauth/authorize?${params.toString()}`
}

export async function exchangeBattleNetCode(code: string, redirectUri?: string): Promise<BattleNetTokenResponse> {
  if (!isBattleNetConfigured()) throw Errors.INTERNAL()

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: getBattleNetRedirectUri(redirectUri),
  })

  const basic = Buffer.from(`${process.env.BNET_CLIENT_ID!}:${process.env.BNET_CLIENT_SECRET!}`).toString('base64')
  const response = await fetch(`${getBattleNetOAuthBase()}/oauth/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  })

  if (!response.ok) {
    throw Errors.UNAUTHORIZED()
  }

  return response.json() as Promise<BattleNetTokenResponse>
}

export async function fetchBattleNetProfile(accessToken: string): Promise<BattleNetProfile> {
  const headers = { Authorization: `Bearer ${accessToken}` }
  const response = await fetch(`${getBattleNetOAuthBase()}/oauth/userinfo`, { headers })

  if (response.ok) return response.json() as Promise<BattleNetProfile>

  // Some OAuth libraries/documentation also reference the global oauth.battle.net userinfo host.
  const fallback = await fetch('https://oauth.battle.net/userinfo', { headers })
  if (!fallback.ok) {
    throw Errors.UNAUTHORIZED()
  }

  return fallback.json() as Promise<BattleNetProfile>
}

export function getBattleNetStableId(profile: BattleNetProfile) {
  const id = profile.sub ?? profile.id
  return id == null ? null : String(id)
}

export function getBattleNetDisplayName(profile: BattleNetProfile) {
  return profile.battletag ?? null
}
