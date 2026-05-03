import { Router } from 'express'
import { z } from 'zod'
import { AuthRequest, authenticate } from '../../shared/middlewares/authenticate'
import { getOnlineUserIds } from '../../infrastructure/socket/server'
import {
  acceptTeamScrimChallenge,
  cancelTeamScrimChallenge,
  cancelTeamScrimSearch,
  createTeamScrimChallenge,
  createTeamScrimSearch,
  declineTeamScrimChallenge,
  listSelfServeScrimsForUser,
} from './scrims.service'

export const scrimsRouter = Router()

scrimsRouter.use(authenticate)

const CreateSearchSchema = z.object({
  teamId: z.string().trim().min(1),
  starterUserIds: z.array(z.string().trim().min(1)).length(5),
  coachUserId: z.string().trim().min(1).optional().nullable(),
  observerUserIds: z.array(z.string().trim().min(1)).max(2).optional().default([]),
  notes: z.string().trim().max(500).optional().nullable(),
})

const CreateChallengeSchema = z.object({
  fromSearchId: z.string().trim().min(1),
  toSearchId: z.string().trim().min(1),
})

scrimsRouter.get('/', async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthRequest
    res.json({ ...(await listSelfServeScrimsForUser(authReq.userId)), onlineUserIds: [...(await getOnlineUserIds())] })
  } catch (err) {
    next(err)
  }
})

scrimsRouter.post('/searches', async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthRequest
    const payload = CreateSearchSchema.parse(req.body ?? {})
    res.status(201).json({ search: await createTeamScrimSearch(authReq.userId, payload, await getOnlineUserIds()) })
  } catch (err) {
    next(err)
  }
})

scrimsRouter.post('/searches/:searchId/cancel', async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthRequest
    res.json({ search: await cancelTeamScrimSearch(authReq.userId, req.params.searchId) })
  } catch (err) {
    next(err)
  }
})

scrimsRouter.post('/challenges', async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthRequest
    const payload = CreateChallengeSchema.parse(req.body ?? {})
    res.status(201).json({ challenge: await createTeamScrimChallenge(authReq.userId, payload.fromSearchId, payload.toSearchId) })
  } catch (err) {
    next(err)
  }
})

scrimsRouter.post('/challenges/:challengeId/accept', async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthRequest
    res.json(await acceptTeamScrimChallenge(authReq.userId, req.params.challengeId, await getOnlineUserIds()))
  } catch (err) {
    next(err)
  }
})

scrimsRouter.post('/challenges/:challengeId/decline', async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthRequest
    res.json({ challenge: await declineTeamScrimChallenge(authReq.userId, req.params.challengeId) })
  } catch (err) {
    next(err)
  }
})

scrimsRouter.post('/challenges/:challengeId/cancel', async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthRequest
    res.json({ challenge: await cancelTeamScrimChallenge(authReq.userId, req.params.challengeId) })
  } catch (err) {
    next(err)
  }
})
