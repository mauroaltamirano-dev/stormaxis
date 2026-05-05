import { Router } from 'express'
import { z } from 'zod'
import { authenticate, AuthRequest } from '../../shared/middlewares/authenticate'
import {
  cancelFriendRequest,
  getFriendStatusByUsername,
  listMyFriends,
  removeFriend,
  respondToFriendRequest,
  sendFriendRequest,
} from './friends.service'

export const friendsRouter = Router()

friendsRouter.use(authenticate)

const SendFriendRequestSchema = z.object({
  toUserId: z.string().trim().min(1).optional(),
  username: z.string().trim().min(2).max(20).optional(),
}).refine((value) => Boolean(value.toUserId || value.username), {
  message: 'Debes indicar usuario destino',
})

const FriendResponseSchema = z.object({
  response: z.enum(['ACCEPT', 'DECLINE']),
})

friendsRouter.get('/me', async (req, res, next) => {
  try {
    res.json(await listMyFriends((req as unknown as AuthRequest).userId))
  } catch (err) {
    next(err)
  }
})

friendsRouter.get('/status/:username', async (req, res, next) => {
  try {
    res.json(await getFriendStatusByUsername((req as unknown as AuthRequest).userId, req.params.username))
  } catch (err) {
    next(err)
  }
})

friendsRouter.post('/requests', async (req, res, next) => {
  try {
    const payload = SendFriendRequestSchema.parse(req.body ?? {})
    res.status(201).json({ request: await sendFriendRequest((req as unknown as AuthRequest).userId, payload) })
  } catch (err) {
    next(err)
  }
})

friendsRouter.post('/requests/:requestId/respond', async (req, res, next) => {
  try {
    const payload = FriendResponseSchema.parse(req.body ?? {})
    res.json({ request: await respondToFriendRequest((req as unknown as AuthRequest).userId, req.params.requestId, payload.response) })
  } catch (err) {
    next(err)
  }
})

friendsRouter.post('/requests/:requestId/cancel', async (req, res, next) => {
  try {
    res.json({ request: await cancelFriendRequest((req as unknown as AuthRequest).userId, req.params.requestId) })
  } catch (err) {
    next(err)
  }
})

friendsRouter.delete('/:friendUserId', async (req, res, next) => {
  try {
    res.json({ request: await removeFriend((req as unknown as AuthRequest).userId, req.params.friendUserId) })
  } catch (err) {
    next(err)
  }
})
