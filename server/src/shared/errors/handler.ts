import { Request, Response, NextFunction } from 'express'
import { ZodError } from 'zod'
import { AppError } from './AppError'
import { logger } from '../../infrastructure/logging/logger'

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
) {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      error: { code: err.code, message: err.message },
    })
  }

  if (err instanceof ZodError) {
    return res.status(422).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid input',
        details: err.flatten().fieldErrors,
      },
    })
  }

  logger.error('Unhandled error', err)
  return res.status(500).json({
    error: { code: 'INTERNAL_ERROR', message: 'Internal server error' },
  })
}
