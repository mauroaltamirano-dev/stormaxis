import type { CSSProperties, ReactNode } from 'react'
import { useEffect, useState } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { useForm, type FieldPath } from 'react-hook-form'
import { z } from 'zod/v4'
import { api } from '../lib/api'
import { useAuthStore } from '../stores/auth.store'
import { ChevronRight } from 'lucide-react'
import { requiresCompetitiveOnboarding } from '../lib/onboarding'

const schema = z.object({
  email: z.string().email('Email inválido'),
  password: z.string().min(1, 'Requerido'),
})
type FormData = z.infer<typeof schema>

export function Login() {
  const { user, setAuth } = useAuthStore()
  const navigate = useNavigate()
  const [serverError, setServerError] = useState('')

  const { register, handleSubmit, setError, clearErrors, formState: { errors, isSubmitting } } = useForm<FormData>()

  useEffect(() => {
    if (!user) return
    navigate({
      to: requiresCompetitiveOnboarding(user) ? '/onboarding' : '/dashboard',
      replace: true,
    })
  }, [navigate, user])

  async function onSubmit(data: FormData) {
    setServerError('')
    clearErrors()
    const parsed = schema.safeParse(data)
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const field = issue.path[0]
        if (typeof field === 'string') setError(field as FieldPath<FormData>, { message: issue.message })
      }
      return
    }
    try {
      const res = await api.post('/auth/login', parsed.data)
      setAuth(res.data.user, res.data.accessToken)
      navigate({ to: requiresCompetitiveOnboarding(res.data.user) ? '/onboarding' : '/dashboard' })
    } catch (err: any) {
      setServerError(err.response?.data?.error?.message || 'Credenciales inválidas')
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', width: '100%', alignSelf: 'stretch', position: 'relative', overflow: 'hidden', backgroundColor: '#05070A' }}>
      {/* Background full-bleed */}
      <div style={{ position: 'absolute', inset: 0, backgroundImage: 'url(/images/greymane_1920x1200.jpg)', backgroundSize: 'cover', backgroundPosition: 'center', opacity: 0.35, filter: 'grayscale(80%)', mixBlendMode: 'luminosity' }} />
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(100deg, rgba(5,7,10,0.98) 0%, rgba(5,7,10,0.6) 55%, rgba(5,7,10,0.97) 100%)' }} />
      {/* Grid pattern */}
      <div style={{ position: 'absolute', inset: 0, opacity: 0.04, backgroundImage: 'linear-gradient(rgba(255,255,255,1) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,1) 1px,transparent 1px)', backgroundSize: '80px 80px', pointerEvents: 'none' }} />

      {/* Left panel — branding */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: 'clamp(2.5rem, 6vw, 5rem)', position: 'relative', zIndex: 1, minWidth: 0 }}>
        {/* Logo */}
        <Link to="/" style={{ display: 'inline-flex', alignItems: 'center', gap: '1rem', textDecoration: 'none' }}>
          <img src="/brand/logo.png" alt="NexusGG" style={{ width: '40px', height: '40px', objectFit: 'contain' }} />
          <span style={{ fontFamily: 'var(--font-display)', fontSize: '1.4rem', fontWeight: 700, letterSpacing: '0.25em', color: '#00c8ff', textTransform: 'uppercase' }}>NexusGG</span>
        </Link>

        {/* Center copy */}
        <div style={{ maxWidth: '520px' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.75rem', border: '1px solid rgba(0,200,255,0.3)', background: 'rgba(0,200,255,0.08)', padding: '0.4rem 1rem', marginBottom: '2rem' }}>
            <span style={{ width: '6px', height: '6px', background: '#00c8ff', display: 'block' }} />
            <span style={{ fontFamily: 'var(--font-display)', fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.3em', color: '#00c8ff' }}>
              Acceso Táctico
            </span>
          </div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(2.8rem, 6vw, 5rem)', fontWeight: 900, textTransform: 'uppercase', color: '#fff', lineHeight: 1.05, margin: '0 0 1.5rem 0' }}>
            De vuelta<br />a la <span style={{ background: 'linear-gradient(90deg, #00c8ff, #7c4dff)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>arena</span>
          </h1>
          <p style={{ color: '#94a3b8', fontSize: '1rem', lineHeight: 1.75, borderLeft: '3px solid rgba(0,200,255,0.4)', paddingLeft: '1.25rem' }}>
            Tu progreso, tu rango, tu historial. Todo te espera adentro. Entrá y seguí compitiendo.
          </p>
        </div>

        {/* Footer note */}
        <p style={{ fontSize: '0.7rem', color: '#334155', fontFamily: 'monospace', letterSpacing: '0.05em' }}>
          © {new Date().getFullYear()} NexusGG — Infraestructura Táctica Independiente
        </p>
      </div>

      {/* Right panel — form */}
      <div style={{ width: 'clamp(360px, 35vw, 520px)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', zIndex: 1, borderLeft: '1px solid rgba(255,255,255,0.06)', background: 'rgba(5,7,10,0.85)', backdropFilter: 'blur(16px)', padding: 'clamp(2.5rem, 5vw, 4rem)' }}>
        {/* Top accent */}
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '2px', background: 'linear-gradient(90deg, transparent, #00c8ff 50%, transparent)' }} />

        <div style={{ width: '100%', maxWidth: '400px' }}>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.8rem', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#fff', marginBottom: '0.5rem' }}>
            Iniciar Sesión
          </h2>
          <p style={{ fontSize: '0.8rem', color: '#64748b', marginBottom: '2.5rem', letterSpacing: '0.05em' }}>
            Ingresá tus credenciales para continuar
          </p>

          {/* OAuth */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '2rem' }}>
            <a href="/api/auth/discord" style={{ textDecoration: 'none' }}>
              <button style={oauthBtn('#5865F2')}>
                <svg width="18" height="14" viewBox="0 0 71 55" fill="currentColor">
                  <path d="M60.1 4.9A58.6 58.6 0 0 0 45.5.4a.2.2 0 0 0-.2.1 40.8 40.8 0 0 0-1.8 3.7 54.1 54.1 0 0 0-16.2 0A37.4 37.4 0 0 0 25.5.5a.2.2 0 0 0-.2-.1A58.5 58.5 0 0 0 10.7 4.9a.2.2 0 0 0-.1.1C1.5 18.1-.9 31-.3 43.6a.2.2 0 0 0 .1.2 58.8 58.8 0 0 0 17.7 8.9.2.2 0 0 0 .2-.1 42 42 0 0 0 3.6-5.9.2.2 0 0 0-.1-.3 38.7 38.7 0 0 1-5.5-2.6.2.2 0 0 1 0-.4l1.1-.9a.2.2 0 0 1 .2 0c11.5 5.3 24 5.3 35.4 0a.2.2 0 0 1 .2 0l1.1.8a.2.2 0 0 1 0 .4 36.1 36.1 0 0 1-5.5 2.6.2.2 0 0 0-.1.3 47.1 47.1 0 0 0 3.6 5.9.2.2 0 0 0 .2.1 58.7 58.7 0 0 0 17.8-8.9.2.2 0 0 0 .1-.2c.7-14.4-2.1-27.2-9.7-38.6a.2.2 0 0 0-.1-.1ZM23.7 36.4c-3.5 0-6.4-3.2-6.4-7.1s2.8-7.1 6.4-7.1c3.6 0 6.5 3.2 6.4 7.1 0 3.9-2.8 7.1-6.4 7.1Zm23.7 0c-3.5 0-6.4-3.2-6.4-7.1s2.8-7.1 6.4-7.1c3.6 0 6.5 3.2 6.4 7.1 0 3.9-2.8 7.1-6.4 7.1Z"/>
                </svg>
                Continuar con Discord
              </button>
            </a>
            <a href="/api/auth/google" style={{ textDecoration: 'none' }}>
              <button style={oauthBtn('#1a1a2e')}>
                <svg width="18" height="18" viewBox="0 0 48 48">
                  <path fill="#FFC107" d="M43.6 20H24v8h11.3C33.7 33.4 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.7 1.1 7.8 2.9l5.7-5.7C33.9 6.6 29.2 4.8 24 4.8 13.4 4.8 4.8 13.4 4.8 24S13.4 43.2 24 43.2c11 0 20-8 20-19.2 0-1.3-.1-2.7-.4-4z"/>
                  <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.5 15.1 18.9 12 24 12c3 0 5.7 1.1 7.8 2.9l5.7-5.7C33.9 6.6 29.2 4.8 24 4.8c-7.7 0-14.4 4.4-17.7 10.9z"/>
                  <path fill="#4CAF50" d="M24 43.2c5.1 0 9.8-1.7 13.4-4.6l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.5-11.2-8.2l-6.5 5C9.6 38.8 16.3 43.2 24 43.2z"/>
                  <path fill="#1976D2" d="M43.6 20H24v8h11.3c-.9 2.4-2.5 4.4-4.5 5.8l6.2 5.2c-.4.3 6.5-4.7 6.5-15 0-1.3-.1-2.7-.4-4z"/>
                </svg>
                Continuar con Google
              </button>
            </a>
          </div>

          {/* Divider */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '2rem' }}>
            <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.08)' }} />
            <span style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.15em', color: '#334155', textTransform: 'uppercase' }}>O con email</span>
            <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.08)' }} />
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit(onSubmit)} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <Field label="Email" error={errors.email?.message}>
              <input {...register('email')} type="email" placeholder="vos@nexusgg.gg" style={inputStyle} />
            </Field>
            <Field label="Contraseña" error={errors.password?.message}>
              <input {...register('password')} type="password" placeholder="••••••••" style={inputStyle} />
            </Field>

            {serverError && (
              <div style={{ fontSize: '0.75rem', color: '#ff4757', background: 'rgba(255,71,87,0.08)', border: '1px solid rgba(255,71,87,0.2)', padding: '0.75rem 1rem' }}>
                {serverError}
              </div>
            )}

            <button type="submit" disabled={isSubmitting} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
              fontFamily: 'var(--font-display)', fontWeight: 700,
              fontSize: '0.9rem', letterSpacing: '0.15em', textTransform: 'uppercase',
              background: isSubmitting ? 'rgba(0,200,255,0.3)' : '#00c8ff',
              color: '#000', border: 'none', padding: '1rem',
              cursor: isSubmitting ? 'not-allowed' : 'pointer',
              marginTop: '0.5rem', transition: 'all 0.2s',
            }}>
              {isSubmitting ? 'Ingresando...' : <><span>Iniciar Sesión</span><ChevronRight size={18} /></>}
            </button>
          </form>

          <p style={{ textAlign: 'center', marginTop: '2rem', fontSize: '0.8rem', color: '#475569' }}>
            ¿No tenés cuenta?{' '}
            <Link to="/register" style={{ color: '#00c8ff', textDecoration: 'none', fontWeight: 700 }}>
              Registrate acá
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}

function Field({ label, error, children }: { label: string; error?: string; children: ReactNode }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#64748b', marginBottom: '0.5rem' }}>
        {label}
      </label>
      {children}
      {error && <div style={{ fontSize: '0.7rem', color: '#ff4757', marginTop: '0.4rem' }}>{error}</div>}
    </div>
  )
}

const inputStyle: CSSProperties = {
  width: '100%', padding: '0.75rem 1rem',
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.1)',
  color: '#f1f5f9',
  fontSize: '0.9rem', fontFamily: 'var(--font-body)',
  outline: 'none', boxSizing: 'border-box',
  transition: 'border-color 0.2s',
}

function oauthBtn(bg: string): CSSProperties {
  return {
    width: '100%', padding: '0.85rem 1.25rem',
    background: bg, color: '#fff',
    border: '1px solid rgba(255,255,255,0.1)',
    fontSize: '0.85rem', fontWeight: 600, fontFamily: 'var(--font-body)',
    cursor: 'pointer', display: 'flex', alignItems: 'center',
    justifyContent: 'center', gap: '0.75rem',
    letterSpacing: '0.05em',
  }
}
