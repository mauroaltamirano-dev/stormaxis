import { Router } from 'express'
import { randomUUID } from 'crypto'
import { rateLimit } from 'express-rate-limit'
import { z } from 'zod'
import { db } from '../../infrastructure/database/client'
import {
  hashPassword,
  comparePassword,
  signAccessToken,
  signRefreshToken,
  saveRefreshToken,
  verifyRefreshToken,
  rotateRefreshToken,
  revokeRefreshToken,
  isDiscordConfigured,
  getDiscordAuthorizeUrl,
  exchangeDiscordCode,
  fetchDiscordProfile,
  getDiscordAvatarUrl,
  getDiscordCreatedAt,
  getClientUrl,
} from './auth.service'
import { Errors } from '../../shared/errors/AppError'
import { authenticate, AuthRequest } from '../../shared/middlewares/authenticate'
import { calculateRank } from '../users/player-progression'
import { getInitialMmrFromRank, INITIAL_RANK_OPTIONS } from '../users/player-calibration'
import { authUserSelect, presentUser } from '../users/user.presenter'
import { cleanupUserMatchmakingSession } from '../matchmaking/matchmaking.service'

export const authRouter = Router()

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: { code: 'TOO_MANY_REQUESTS', message: 'Too many attempts' } },
})

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict' as const,
  maxAge: 30 * 24 * 60 * 60 * 1000,
  path: '/api/auth',
}

const OAUTH_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  maxAge: 10 * 60 * 1000,
  path: '/api/auth',
}

interface OAuthIntent {
  mode: 'login' | 'link'
  userId?: string
  provider: 'discord'
  clientOrigin?: string
  redirectUri?: string
}

function getAllowedClientOrigins() {
  const raw = process.env.CLIENT_URLS || process.env.CLIENT_URL || 'http://localhost:5173'
  return raw.split(',').map((origin) => origin.trim()).filter(Boolean)
}

function isDevLanOrigin(origin: string) {
  return /^http:\/\/(localhost|127\.0\.0\.1|\d{1,3}(?:\.\d{1,3}){3})(:\d+)?$/.test(origin)
}

function isAllowedClientOrigin(origin: string) {
  const allowed = getAllowedClientOrigins()
  return allowed.includes(origin) || (process.env.NODE_ENV !== 'production' && isDevLanOrigin(origin))
}

function getRequestClientOrigin(req: any): string | undefined {
  const direct = req.get('origin')
  if (direct && isAllowedClientOrigin(direct)) return direct

  const referer = req.get('referer')
  if (!referer) return undefined

  try {
    const parsed = new URL(referer)
    const origin = parsed.origin
    return isAllowedClientOrigin(origin) ? origin : undefined
  } catch {
    return undefined
  }
}

function getDiscordRedirectUriForRequest(req: any) {
  if (process.env.NODE_ENV === 'production' && process.env.DISCORD_REDIRECT_URI) {
    return process.env.DISCORD_REDIRECT_URI
  }

  const fromRequest = getRequestClientOrigin(req)
  if (fromRequest) return `${fromRequest}/api/auth/discord/callback`
  return undefined
}

function sanitizeDiscordRedirectUri(raw?: string) {
  if (!raw) return undefined
  try {
    const parsed = new URL(raw)
    if (!isAllowedClientOrigin(parsed.origin)) return undefined
    if (parsed.pathname !== '/api/auth/discord/callback') return undefined
    return `${parsed.origin}${parsed.pathname}`
  } catch {
    return undefined
  }
}

// ─── Register ─────────────────────────────────────────────

const RegisterSchema = z.object({
  username: z.string().min(3).max(20).regex(/^[a-zA-Z0-9_-]+$/),
  email: z.string().email(),
  password: z.string().min(8).max(72),
  initialRank: z.enum(INITIAL_RANK_OPTIONS).optional(),
})

authRouter.post('/register', authLimiter, async (req, res, next) => {
  try {
    const body = RegisterSchema.parse(req.body)

    const existing = await db.user.findFirst({
      where: { OR: [{ email: body.email }, { username: body.username }] },
    })
    if (existing) throw Errors.CONFLICT('Email or username already taken')

    const initialMmr = getInitialMmrFromRank(body.initialRank)

    const user = await db.user.create({
      data: {
        username: body.username,
        email: body.email,
        password: await hashPassword(body.password),
        mmr: initialMmr,
        rank: calculateRank(initialMmr),
      },
      select: authUserSelect,
    })

    const accessToken = signAccessToken(user.id, user.role)
    const { token: refreshToken, jti } = signRefreshToken(user.id)
    await saveRefreshToken(user.id, jti)

    res.cookie('refreshToken', refreshToken, COOKIE_OPTIONS)
    res.status(201).json({
      accessToken,
      user: presentUser(user),
    })
  } catch (err) {
    next(err)
  }
})

// ─── Login ────────────────────────────────────────────────

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
})

authRouter.post('/login', authLimiter, async (req, res, next) => {
  try {
    const body = LoginSchema.parse(req.body)

    const user = await db.user.findUnique({
      where: { email: body.email },
      select: {
        ...authUserSelect,
        password: true,
      },
    })

    // Always run bcrypt to prevent timing attacks
    const validPassword = user?.password
      ? await comparePassword(body.password, user.password)
      : await comparePassword(body.password, '$2b$12$invalidhashpadding0000000000000')

    if (!user || !validPassword) throw Errors.UNAUTHORIZED()
    if (user.isBanned) throw Errors.FORBIDDEN()

    const accessToken = signAccessToken(user.id, user.role)
    const { token: refreshToken, jti } = signRefreshToken(user.id)
    await saveRefreshToken(user.id, jti)

    res.cookie('refreshToken', refreshToken, COOKIE_OPTIONS)
    res.json({
      accessToken,
      user: presentUser(user),
    })
  } catch (err) {
    next(err)
  }
})

// ─── Refresh ──────────────────────────────────────────────

authRouter.post('/refresh', async (req, res, next) => {
  try {
    const token = req.cookies?.refreshToken as string | undefined
    if (!token) throw Errors.UNAUTHORIZED()

    const payload = verifyRefreshToken(token)
    if (!payload) throw Errors.UNAUTHORIZED()

    const { accessToken, refreshToken, jti: _ } = await rotateRefreshToken(payload.jti, payload.sub)

    res.cookie('refreshToken', refreshToken, COOKIE_OPTIONS)
    res.json({ accessToken })
  } catch (err) {
    next(err)
  }
})

// ─── Logout ───────────────────────────────────────────────

authRouter.post('/logout', authenticate, async (req, res, next) => {
  try {
    await cleanupUserMatchmakingSession(
      (req as AuthRequest).userId,
      'Player logged out during accept',
    )

    const token = req.cookies?.refreshToken as string | undefined
    if (token) {
      const payload = verifyRefreshToken(token)
      if (payload) await revokeRefreshToken(payload.jti)
    }
    res.clearCookie('refreshToken', { path: '/api/auth' })
    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})

// ─── Discord OAuth ────────────────────────────────────────

authRouter.get('/discord', (req, res) => {
  if (!isDiscordConfigured()) {
    return res.status(503).json({ error: { code: 'DISCORD_NOT_CONFIGURED', message: 'Discord OAuth is not configured' } })
  }

  const state = randomUUID()
  const clientOrigin = getRequestClientOrigin(req)
  const redirectUri = getDiscordRedirectUriForRequest(req)
  const intent: OAuthIntent = { mode: 'login', provider: 'discord', clientOrigin, redirectUri }

  res.cookie('oauth_state', state, OAUTH_COOKIE_OPTIONS)
  res.cookie('oauth_intent', encodeURIComponent(JSON.stringify(intent)), OAUTH_COOKIE_OPTIONS)
  res.redirect(getDiscordAuthorizeUrl(state, redirectUri))
})

authRouter.get('/link/discord', authenticate, (req, res) => {
  if (!isDiscordConfigured()) {
    return res.status(503).json({ error: { code: 'DISCORD_NOT_CONFIGURED', message: 'Discord OAuth is not configured' } })
  }

  const state = randomUUID()
  const clientOrigin = getRequestClientOrigin(req)
  const redirectUri = getDiscordRedirectUriForRequest(req)
  const intent: OAuthIntent = {
    mode: 'link',
    provider: 'discord',
    userId: (req as AuthRequest).userId,
    clientOrigin,
    redirectUri,
  }

  res.cookie('oauth_state', state, OAUTH_COOKIE_OPTIONS)
  res.cookie('oauth_intent', encodeURIComponent(JSON.stringify(intent)), OAUTH_COOKIE_OPTIONS)
  res.redirect(getDiscordAuthorizeUrl(state, redirectUri))
})

authRouter.get('/discord/callback', async (req, res) => {
  const clearOAuthCookies = () => {
    res.clearCookie('oauth_state', { path: '/api/auth' })
    res.clearCookie('oauth_intent', { path: '/api/auth' })
  }

  const redirectToClient = (search: Record<string, string>, clientOrigin?: string) => {
    const params = new URLSearchParams(search)
    const baseUrl = clientOrigin && isAllowedClientOrigin(clientOrigin) ? clientOrigin : getClientUrl()
    res.redirect(`${baseUrl}/auth/callback?${params.toString()}`)
  }

  try {
    const code = req.query.code
    const state = req.query.state
    const cookieState = req.cookies?.oauth_state as string | undefined
    const cookieIntent = req.cookies?.oauth_intent as string | undefined

    if (typeof code !== 'string' || typeof state !== 'string' || !cookieState || !cookieIntent || state !== cookieState) {
      clearOAuthCookies()
      return redirectToClient({ provider: 'discord', error: 'oauth_state_mismatch' })
    }

    const intent = JSON.parse(decodeURIComponent(cookieIntent)) as OAuthIntent
    const clientOrigin = intent.clientOrigin && isAllowedClientOrigin(intent.clientOrigin) ? intent.clientOrigin : undefined
    const redirectUri = sanitizeDiscordRedirectUri(intent.redirectUri)
    const token = await exchangeDiscordCode(code, redirectUri)
    const profile = await fetchDiscordProfile(token.access_token)

    if (!profile.email) {
      clearOAuthCookies()
      return redirectToClient({ provider: 'discord', error: 'discord_email_required' }, clientOrigin)
    }

    const avatarUrl = getDiscordAvatarUrl(profile)
    const discordCreatedAt = getDiscordCreatedAt(profile.id)
    const isSuspect = Date.now() - discordCreatedAt.getTime() < 60 * 24 * 60 * 60 * 1000

    if (intent.mode === 'link') {
      if (!intent.userId) {
        clearOAuthCookies()
        return redirectToClient({ provider: 'discord', error: 'invalid_link_intent' }, clientOrigin)
      }

      const owner = await db.user.findFirst({
        where: { discordId: profile.id, NOT: { id: intent.userId } },
        select: { id: true },
      })

      if (owner) {
        clearOAuthCookies()
        return redirectToClient({ provider: 'discord', error: 'discord_already_linked' }, clientOrigin)
      }

      await db.user.update({
        where: { id: intent.userId },
        data: {
          discordId: profile.id,
          discordUsername: profile.global_name || profile.username,
          discordCreatedAt,
          avatar: avatarUrl,
          isSuspect,
        },
        select: authUserSelect,
      })

      clearOAuthCookies()
      return redirectToClient({ provider: 'discord', mode: 'link', linked: 'true' }, clientOrigin)
    }

    let user = await db.user.findUnique({
      where: { discordId: profile.id },
      select: authUserSelect,
    })

    if (!user) {
      const existingByEmail = await db.user.findUnique({
        where: { email: profile.email },
        select: authUserSelect,
      })

      if (existingByEmail) {
        user = await db.user.update({
          where: { id: existingByEmail.id },
          data: {
            discordId: profile.id,
            discordUsername: profile.global_name || profile.username,
            discordCreatedAt,
            avatar: existingByEmail.avatar ?? avatarUrl,
            isSuspect: existingByEmail.createdAt ? existingByEmail.createdAt > discordCreatedAt ? existingByEmail.isSuspect : isSuspect : isSuspect,
          },
          select: authUserSelect,
        })
      } else {
        const username = await generateUniqueUsername(profile.global_name || profile.username)
        user = await db.user.create({
          data: {
            username,
            email: profile.email,
            avatar: avatarUrl,
            discordId: profile.id,
            discordUsername: profile.global_name || profile.username,
            discordCreatedAt,
            isSuspect,
            mmr: 1200,
            rank: calculateRank(1200),
          },
          select: authUserSelect,
        })
      }
    }

    if (user.isBanned) {
      clearOAuthCookies()
      return redirectToClient({ provider: 'discord', error: 'user_banned' }, clientOrigin)
    }

    const { token: refreshToken, jti } = signRefreshToken(user.id)
    await saveRefreshToken(user.id, jti)

    clearOAuthCookies()
    res.cookie('refreshToken', refreshToken, COOKIE_OPTIONS)
    return redirectToClient({ provider: 'discord', mode: 'login', access: 'granted' }, clientOrigin)
  } catch {
    clearOAuthCookies()
    return redirectToClient({ provider: 'discord', error: 'discord_auth_failed' })
  }
})

authRouter.get('/google', (_req, res) => {
  res.json({ message: 'Configure GOOGLE_CLIENT_ID to enable Google OAuth' })
})

authRouter.get('/bnet', (_req, res) => {
  res.json({ message: 'Configure BNET_CLIENT_ID to enable Battle.net OAuth' })
})

// ─── Me ───────────────────────────────────────────────────

authRouter.get('/me', authenticate, async (req, res, next) => {
  try {
    const userId = (req as AuthRequest).userId
    const user = await db.user.findUnique({
      where: { id: userId },
      select: authUserSelect,
    })
    if (!user) throw Errors.NOT_FOUND('User')
    res.json(presentUser(user))
  } catch (err) {
    next(err)
  }
})

async function generateUniqueUsername(rawBase: string) {
  const sanitized = rawBase
    .normalize('NFKD')
    .replace(/[^\w-]+/g, '')
    .replace(/_/g, '')
    .slice(0, 16)

  const base = sanitized.length >= 3 ? sanitized : 'player'

  for (let attempt = 0; attempt < 20; attempt++) {
    const suffix = attempt === 0 ? '' : `${Math.floor(100 + Math.random() * 900)}`
    const candidate = `${base}${suffix}`.slice(0, 20)
    const exists = await db.user.findUnique({ where: { username: candidate }, select: { id: true } })
    if (!exists) return candidate
  }

  return `player${Date.now().toString().slice(-6)}`
}
