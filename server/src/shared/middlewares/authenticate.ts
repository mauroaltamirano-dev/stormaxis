import { Request, Response, NextFunction } from 'express'
import { verifyAccessToken } from '../../modules/auth/auth.service'
import { Errors } from '../errors/AppError'

export interface AuthRequest extends Request {
  userId: string
  userRole: string
}

export function authenticate(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization
  if (!header?.startsWith('Bearer ')) throw Errors.UNAUTHORIZED()

  const token = header.slice(7)
  const payload = verifyAccessToken(token)
  if (!payload) throw Errors.UNAUTHORIZED()

  ;(req as AuthRequest).userId = payload.sub
  ;(req as AuthRequest).userRole = payload.role
  next()
}

export function requireAdmin(req: Request, _res: Response, next: NextFunction) {
  if ((req as AuthRequest).userRole !== 'ADMIN') throw Errors.FORBIDDEN()
  next()
}
