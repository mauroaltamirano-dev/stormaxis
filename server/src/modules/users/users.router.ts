import { Router } from 'express'
import { z } from 'zod'
import { authenticate, AuthRequest } from '../../shared/middlewares/authenticate'
import { db } from '../../infrastructure/database/client'
import { Errors } from '../../shared/errors/AppError'
import { calculateRank } from './player-progression'
import { getInitialMmrFromRank, INITIAL_RANK_OPTIONS } from './player-calibration'
import { authUserSelect, presentPublicUser, presentUser, publicUserSelect } from './user.presenter'
import { isValidCountryCode } from '@nexusgg/shared'

export const usersRouter = Router()

const USERNAME_REGEX = /^[a-zA-Z0-9_-]+$/
const PLAYER_ROLES = ['RANGED', 'HEALER', 'OFFLANE', 'FLEX', 'TANK'] as const
const AccountProviderSchema = z.enum(['discord', 'google', 'bnet'])
const CountryCodeSchema = z
  .preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? null : value),
    z.string().trim().toUpperCase().length(2).nullable().optional(),
  )
  .refine((value) => value == null || isValidCountryCode(value), {
    message: 'País inválido',
  })

const SearchUsersQuerySchema = z.object({
  q: z.preprocess(
    (value) => (Array.isArray(value) ? value[0] : value),
    z.string().trim().min(2).max(20),
  ),
})

const UpdateProfileSchema = z
  .object({
    username: z
      .string()
      .trim()
      .min(3)
      .max(20)
      .regex(USERNAME_REGEX)
      .optional(),
    avatar: z.preprocess(
      (value) => {
        if (typeof value !== 'string') return value
        const trimmed = value.trim()
        return trimmed === '' ? null : trimmed
      },
      z.string().url().max(500).nullable().optional(),
    ),
    mainRole: z.enum(PLAYER_ROLES).nullable().optional(),
    secondaryRole: z.enum(PLAYER_ROLES).nullable().optional(),
    countryCode: CountryCodeSchema,
  })
  .refine(
    (value) =>
      value.username !== undefined ||
      value.avatar !== undefined ||
      value.mainRole !== undefined ||
      value.secondaryRole !== undefined ||
      value.countryCode !== undefined,
    {
      message: 'Tenés que enviar al menos un campo editable',
    },
  )
  .refine(
    (value) =>
      !value.mainRole ||
      !value.secondaryRole ||
      value.mainRole !== value.secondaryRole,
    {
      message: 'Main y secundario no pueden ser el mismo rol',
      path: ['secondaryRole'],
    },
  )

const CompleteOnboardingSchema = z
  .object({
    username: z
      .string()
      .trim()
      .min(3)
      .max(20)
      .regex(USERNAME_REGEX)
      .optional(),
    initialRank: z.enum(INITIAL_RANK_OPTIONS),
    mainRole: z.enum(PLAYER_ROLES),
    secondaryRole: z.enum(PLAYER_ROLES),
    countryCode: CountryCodeSchema,
  })
  .refine((value) => value.mainRole !== value.secondaryRole, {
    message: 'Main y secundario no pueden ser el mismo rol',
    path: ['secondaryRole'],
  })

usersRouter.get('/me', authenticate, async (req, res, next) => {
  try {
    const user = await db.user.findUnique({
      where: { id: (req as AuthRequest).userId },
      select: authUserSelect,
    })
    if (!user) throw Errors.NOT_FOUND('User')
    res.json(presentUser(user))
  } catch (err) {
    next(err)
  }
})

usersRouter.post('/me/onboarding', authenticate, async (req, res, next) => {
  try {
    const body = CompleteOnboardingSchema.parse(req.body ?? {})
    const userId = (req as AuthRequest).userId

    const currentUser = await db.user.findUnique({
      where: { id: userId },
      select: authUserSelect,
    })
    if (!currentUser) throw Errors.NOT_FOUND('User')

    if (body.username && body.username !== currentUser.username) {
      const existing = await db.user.findUnique({
        where: { username: body.username },
        select: { id: true },
      })
      if (existing && existing.id !== userId) {
        throw Errors.CONFLICT('Ese username ya está tomado')
      }
    }

    const nextMmr = getInitialMmrFromRank(body.initialRank)

    const updated = await db.user.update({
      where: { id: userId },
      data: {
        ...(body.username !== undefined ? { username: body.username } : {}),
        mmr: nextMmr,
        rank: calculateRank(nextMmr),
        mainRole: body.mainRole as any,
        secondaryRole: body.secondaryRole as any,
        countryCode: body.countryCode ?? currentUser.countryCode ?? null,
      },
      select: authUserSelect,
    })

    res.json(presentUser(updated))
  } catch (err) {
    next(err)
  }
})

usersRouter.patch('/me', authenticate, async (req, res, next) => {
  try {
    const body = UpdateProfileSchema.parse(req.body ?? {})
    const userId = (req as AuthRequest).userId

    const currentUser = await db.user.findUnique({
      where: { id: userId },
      select: authUserSelect,
    })
    if (!currentUser) throw Errors.NOT_FOUND('User')

    if (body.username && body.username !== currentUser.username) {
      const existing = await db.user.findUnique({
        where: { username: body.username },
        select: { id: true },
      })
      if (existing && existing.id !== userId) {
        throw Errors.CONFLICT('Ese username ya está tomado')
      }
    }

    const updated = await db.user.update({
      where: { id: userId },
      data: {
        ...(body.username !== undefined ? { username: body.username } : {}),
        ...(body.avatar !== undefined ? { avatar: body.avatar } : {}),
        // Cast until local Prisma Client is regenerated after the role enum migration.
        ...(body.mainRole !== undefined ? { mainRole: body.mainRole as any } : {}),
        ...(body.secondaryRole !== undefined ? { secondaryRole: body.secondaryRole as any } : {}),
        ...(body.countryCode !== undefined ? { countryCode: body.countryCode } : {}),
      },
      select: authUserSelect,
    })

    res.json(presentUser(updated))
  } catch (err) {
    next(err)
  }
})

usersRouter.delete('/me/accounts/:provider', authenticate, async (req, res, next) => {
  try {
    const provider = AccountProviderSchema.parse(req.params.provider)
    const userId = (req as AuthRequest).userId

    const currentUser = await db.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        password: true,
        discordId: true,
        googleId: true,
        bnetId: true,
      },
    })
    if (!currentUser) throw Errors.NOT_FOUND('User')

    const linkedProviders = [currentUser.discordId, currentUser.googleId, currentUser.bnetId].filter(Boolean).length
    const providerMap = {
      discord: currentUser.discordId,
      google: currentUser.googleId,
      bnet: currentUser.bnetId,
    } as const

    if (!providerMap[provider]) {
      throw Errors.CONFLICT('Esa cuenta no está vinculada')
    }

    if (!currentUser.password && linkedProviders <= 1) {
      throw Errors.CONFLICT('No podés desvincular tu último acceso si no tenés contraseña')
    }

    const updated = await db.user.update({
      where: { id: userId },
      data:
        provider === 'discord'
          ? {
              discordId: null,
              discordUsername: null,
              discordCreatedAt: null,
            }
          : provider === 'google'
            ? {
                googleId: null,
              }
            : {
                bnetId: null,
                bnetBattletag: null,
              },
      select: authUserSelect,
    })

    res.json(presentUser(updated))
  } catch (err) {
    next(err)
  }
})

usersRouter.get('/search', async (req, res, next) => {
  try {
    const { q } = SearchUsersQuerySchema.parse(req.query ?? {})

    const users = await db.user.findMany({
      where: {
        username: {
          contains: q,
          mode: 'insensitive',
        },
      },
      select: publicUserSelect,
      orderBy: [{ mmr: 'desc' }, { username: 'asc' }],
      take: 8,
    })

    res.json(users.map(presentPublicUser))
  } catch (err) {
    next(err)
  }
})

usersRouter.get('/:username', async (req, res, next) => {
  try {
    const user = await db.user.findUnique({
      where: { username: req.params.username },
      select: publicUserSelect,
    })
    if (!user) throw Errors.NOT_FOUND('User')
    res.json(presentPublicUser(user))
  } catch (err) {
    next(err)
  }
})

usersRouter.get('/:username/matches', async (req, res, next) => {
  try {
    const user = await db.user.findUnique({ where: { username: req.params.username } })
    if (!user) throw Errors.NOT_FOUND('User')

    const matches = await db.matchPlayer.findMany({
      where: { userId: user.id },
      include: {
        match: {
          select: {
            id: true, status: true, selectedMap: true, winner: true,
            createdAt: true, endedAt: true,
          },
        },
      },
      orderBy: { match: { createdAt: 'desc' } },
      take: 20,
    })

    res.json(matches)
  } catch (err) {
    next(err)
  }
})
