import { useEffect } from 'react'
import { RouterProvider } from '@tanstack/react-router'
import { router } from './router'
import { api } from './lib/api'
import { useAuthStore } from './stores/auth.store'

export function App() {
  const { setAuth, setAccessToken, logout, isLoading } = useAuthStore()

  // Silent session restore on mount
  useEffect(() => {
    api.post<{ accessToken: string }>('/auth/refresh')
      .then((r) => {
        setAccessToken(r.data.accessToken)
        return api.get('/auth/me').then((me) => {
          setAuth(me.data, r.data.accessToken)
        })
      })
      .catch(() => {
        logout()
      })
  }, [])

  if (isLoading) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--nexus-bg)',
        color: 'var(--nexus-text)',
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{
            width: '40px',
            height: '40px',
            margin: '0 auto 12px',
            borderRadius: '50%',
            border: '3px solid var(--nexus-accent)',
            borderTopColor: 'transparent',
            animation: 'spin-slow 1s linear infinite',
          }} />
          <div style={{
            fontFamily: 'var(--font-display)',
            fontSize: '18px',
            fontWeight: 700,
            letterSpacing: '2px',
            textTransform: 'uppercase',
          }}>
            Restaurando sesión
          </div>
        </div>
      </div>
    )
  }

  return <RouterProvider router={router} />
}
