import axios from 'axios'
import { useAuthStore } from '../stores/auth.store'
import { API_BASE_URL } from './backend'

export const api = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true, // for refresh token cookie
})

// Attach access token to every request
api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// Auto-refresh on 401
let refreshing: Promise<string | null> | null = null

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config
    const requestUrl = String(original?.url ?? '')

    if (error.response?.status === 401 && requestUrl.includes('/auth/refresh')) {
      useAuthStore.getState().logout()
      return Promise.reject(error)
    }

    if (error.response?.status === 401 && !original._retry) {
      original._retry = true

      if (!refreshing) {
        refreshing = api
          .post<{ accessToken: string }>('/auth/refresh')
          .then((res) => {
            const token = res.data.accessToken
            useAuthStore.getState().setAccessToken(token)
            return token
          })
          .catch(() => {
            useAuthStore.getState().logout()
            return null
          })
          .finally(() => {
            refreshing = null
          })
      }

      const token = await refreshing
      if (!token) return Promise.reject(error)

      original.headers ??= {}
      original.headers.Authorization = `Bearer ${token}`
      return api(original)
    }

    return Promise.reject(error)
  },
)
