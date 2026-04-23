const API_ORIGIN = (import.meta.env.VITE_API_URL || '').replace(/\/+$/, '')

export const API_BASE_URL = API_ORIGIN ? `${API_ORIGIN}/api` : '/api'

export function buildApiUrl(path: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  const withApiPrefix = normalizedPath.startsWith('/api/')
    ? normalizedPath
    : `/api${normalizedPath}`

  return API_ORIGIN ? `${API_ORIGIN}${withApiPrefix}` : withApiPrefix
}
