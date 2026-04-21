type LoggerLevel = 'info' | 'warn' | 'error'

function normalizeMeta(meta: unknown) {
  if (meta instanceof Error) {
    return {
      name: meta.name,
      message: meta.message,
      stack: meta.stack,
    }
  }

  if (typeof meta === 'undefined') return undefined
  return meta
}

function write(level: LoggerLevel, message: string, meta?: unknown) {
  const payload = {
    level,
    message,
    timestamp: new Date().toISOString(),
    ...(typeof meta === 'undefined' ? {} : { meta: normalizeMeta(meta) }),
  }

  const line = JSON.stringify(payload)
  if (level === 'error') {
    console.error(line)
    return
  }
  if (level === 'warn') {
    console.warn(line)
    return
  }
  console.log(line)
}

export const logger = {
  info(message: string, meta?: unknown) {
    write('info', message, meta)
  },
  warn(message: string, meta?: unknown) {
    write('warn', message, meta)
  },
  error(message: string, meta?: unknown) {
    write('error', message, meta)
  },
}
