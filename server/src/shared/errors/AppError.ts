export class AppError extends Error {
  constructor(
    public readonly code: string,
    public readonly statusCode: number,
    message?: string,
  ) {
    super(message ?? code)
    this.name = 'AppError'
  }
}

export const Errors = {
  UNAUTHORIZED: () => new AppError('UNAUTHORIZED', 401),
  FORBIDDEN: () => new AppError('FORBIDDEN', 403),
  NOT_FOUND: (resource = 'Resource') => new AppError('NOT_FOUND', 404, `${resource} not found`),
  CONFLICT: (msg: string) => new AppError('CONFLICT', 409, msg),
  VALIDATION: (msg: string) => new AppError('VALIDATION_ERROR', 422, msg),
  INTERNAL: () => new AppError('INTERNAL_ERROR', 500),
} as const
