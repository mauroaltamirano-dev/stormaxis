import { Router } from 'express'
import { z } from 'zod'
import { authenticate, AuthRequest } from '../../shared/middlewares/authenticate'
import { getActiveMatch, joinQueue, leaveQueue, getQueueSnapshot, getQueueStatus, scheduleTryFormMatch } from './matchmaking.service'

export const matchmakingRouter = Router()

matchmakingRouter.use(authenticate)

const JoinQueueSchema = z.object({
  mode: z.enum(['COMPETITIVE', 'UNRANKED', 'TEAM']).default('COMPETITIVE'),
  roles: z.array(z.string()).default([]),
})

matchmakingRouter.post('/queue/join', async (req, res, next) => {
  try {
    const { mode, roles } = JoinQueueSchema.parse(req.body)
    const result = await joinQueue((req as AuthRequest).userId, mode, roles)
    await scheduleTryFormMatch()
    res.json({ ok: true, ...result })
  } catch (err) {
    next(err)
  }
})

matchmakingRouter.post('/queue/leave', async (req, res, next) => {
  try {
    await leaveQueue((req as AuthRequest).userId)
    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})

matchmakingRouter.get('/queue/status', async (req, res, next) => {
  try {
    const status = await getQueueStatus((req as AuthRequest).userId)
    res.json(status)
  } catch (err) {
    next(err)
  }
})

matchmakingRouter.get('/queue/snapshot', async (_req, res, next) => {
  try {
    const snapshot = await getQueueSnapshot()
    res.json(snapshot)
  } catch (err) {
    next(err)
  }
})

matchmakingRouter.get('/active', async (req, res, next) => {
  try {
    const match = await getActiveMatch((req as AuthRequest).userId)
    res.json({ match })
  } catch (err) {
    next(err)
  }
})
