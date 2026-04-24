import { useEffect, useRef } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { api } from '../lib/api'
import { useAuthStore } from '../stores/auth.store'
import { requiresCompetitiveOnboarding } from '../lib/onboarding'

export function AuthCallback() {
  const navigate = useNavigate()
  const { user, accessToken, isLoading, setAuth, updateUser } = useAuthStore()
  const handledRef = useRef(false)

  const search = new URLSearchParams(window.location.search)
  const error = search.get('error')
  const provider = search.get('provider') ?? 'discord'
  const mode = search.get('mode')
  const callbackAccessToken = search.get('accessToken')

  useEffect(() => {
    if (isLoading || handledRef.current) return
    handledRef.current = true

    if (error) {
      navigate({ to: user ? '/profile' : '/login', replace: true })
      return
    }

    if (callbackAccessToken) {
      useAuthStore.getState().setAccessToken(callbackAccessToken)
    }

    let resolvedUser: typeof user | null = null

    api
      .get('/auth/me', callbackAccessToken
        ? { headers: { Authorization: `Bearer ${callbackAccessToken}` } }
        : undefined)
      .then((response) => {
        const nextUser = response.data
        resolvedUser = nextUser
        const token = callbackAccessToken || useAuthStore.getState().accessToken
        if (token) setAuth(nextUser, token)
        else updateUser(nextUser)
      })
      .catch(() => {})
      .finally(() => {
        const currentUser = resolvedUser || useAuthStore.getState().user
        const nextTarget =
          currentUser
            ? mode === 'link'
              ? '/profile'
              : requiresCompetitiveOnboarding(currentUser)
                ? '/onboarding'
                : currentUser.role === 'ADMIN'
                  ? '/admin'
                  : '/dashboard'
            : '/login'

        navigate({ to: nextTarget, replace: true })
      })
  }, [accessToken, callbackAccessToken, error, isLoading, mode, navigate, setAuth, updateUser, user])

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--nexus-bg)',
        color: 'var(--nexus-text)',
        padding: '24px',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '420px',
          background: 'var(--nexus-card)',
          border: '1px solid var(--nexus-border)',
          borderRadius: '16px',
          padding: '28px 24px',
          textAlign: 'center',
        }}
      >
        <div
          style={{
            width: '42px',
            height: '42px',
            margin: '0 auto 14px',
            borderRadius: '50%',
            border: '3px solid var(--nexus-accent)',
            borderTopColor: 'transparent',
            animation: 'spin-slow 1s linear infinite',
          }}
        />
        <div
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: '22px',
            fontWeight: 700,
            letterSpacing: '2px',
            textTransform: 'uppercase',
            marginBottom: '8px',
          }}
        >
          {error ? 'OAuth cancelado' : mode === 'link' ? 'Vinculando cuenta' : 'Autenticando'}
        </div>
        <div style={{ fontSize: '13px', color: 'var(--nexus-muted)' }}>
          {error
            ? `No pudimos completar el acceso con ${provider}. Te redirijo para que lo intentes de nuevo.`
            : mode === 'link'
              ? `Conectando ${provider} con tu perfil competitivo. Bancame un segundo.`
              : `Procesando el acceso con ${provider}. Bancame un segundo.`}
        </div>
      </div>
    </div>
  )
}
