type ClientErrorPayload = {
  message: string
  stack?: string | null
  context?: string
  url: string
  userAgent: string
  timestamp: string
}

let globalHandlersRegistered = false
const ERROR_DEDUP_WINDOW_MS = 15_000
const lastReportedAtBySignature = new Map<string, number>()

function normalizeError(input: unknown) {
  if (input instanceof Error) {
    return {
      message: input.message,
      stack: input.stack ?? null,
    }
  }

  if (typeof input === 'string') {
    return { message: input, stack: null }
  }

  try {
    return { message: JSON.stringify(input), stack: null }
  } catch {
    return { message: 'Unknown client error', stack: null }
  }
}

async function sendClientError(payload: ClientErrorPayload) {
  if (import.meta.env.VITE_DISABLE_CLIENT_ERROR_REPORTING === 'true') return

  try {
    await fetch('/api/client-errors', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      keepalive: true,
      body: JSON.stringify(payload),
    })
  } catch {
    // noop: fallback is local console logging
  }
}

function shouldSkipDuplicate(payload: ClientErrorPayload) {
  const signature = `${payload.context ?? 'unknown'}::${payload.message}`
  const now = Date.now()
  const lastReportedAt = lastReportedAtBySignature.get(signature)
  if (typeof lastReportedAt === 'number' && now - lastReportedAt < ERROR_DEDUP_WINDOW_MS) {
    return true
  }

  lastReportedAtBySignature.set(signature, now)
  if (lastReportedAtBySignature.size > 200) {
    const firstKey = lastReportedAtBySignature.keys().next().value
    if (firstKey) lastReportedAtBySignature.delete(firstKey)
  }

  return false
}

export function reportClientError(error: unknown, context?: string) {
  const normalized = normalizeError(error)
  const payload: ClientErrorPayload = {
    message: normalized.message.slice(0, 500),
    stack: normalized.stack?.slice(0, 4_000) ?? null,
    context,
    url: window.location.href,
    userAgent: window.navigator.userAgent,
    timestamp: new Date().toISOString(),
  }

  if (shouldSkipDuplicate(payload)) return

  console.error('[client-error]', payload)
  void sendClientError(payload)
}

export function registerGlobalErrorHandlers() {
  if (globalHandlersRegistered) return
  globalHandlersRegistered = true

  window.addEventListener('error', (event) => {
    reportClientError(event.error ?? event.message, 'window.error')
  })

  window.addEventListener('unhandledrejection', (event) => {
    reportClientError(event.reason, 'window.unhandledrejection')
  })
}
