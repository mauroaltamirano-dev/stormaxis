import { Router } from 'express'
import { authenticate, AuthRequest } from '../../shared/middlewares/authenticate'
import { listNotifications } from './notifications.service'

export const notificationsRouter = Router()

notificationsRouter.use(authenticate)

notificationsRouter.get('/', async (req, res, next) => {
  try {
    res.json(await listNotifications((req as AuthRequest).userId))
  } catch (err) {
    next(err)
  }
})
