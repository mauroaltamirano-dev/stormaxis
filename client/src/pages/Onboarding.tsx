import type { CSSProperties } from 'react'
import { useMemo, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useForm, type FieldPath } from 'react-hook-form'
import { z } from 'zod/v4'
import { ChevronRight, ShieldCheck, Target, Trophy } from 'lucide-react'
import { api } from '../lib/api'
import { useAuthStore } from '../stores/auth.store'
import { getRoleIconSources, getRoleMeta, type PlayerRoleKey } from '../lib/roles'
import {
  inferInitialRankFromMmr,
  INITIAL_RANKS,
  ONBOARDING_ROLE_ORDER,
  type InitialRankValue,
} from '../lib/onboarding'
import { COUNTRY_OPTIONS } from '../lib/countries'

const schema = z
  .object({
    username: z
      .string()
      .trim()
      .min(3, 'Mínimo 3 caracteres')
      .max(20, 'Máximo 20')
      .regex(/^[a-zA-Z0-9_-]+$/, 'Solo letras, números, _ y -'),
    initialRank: z.enum(INITIAL_RANKS.map((rank) => rank.value) as [InitialRankValue, ...InitialRankValue[]], {
      error: 'Seleccioná tu rango base',
    }),
    mainRole: z.enum(['RANGED', 'HEALER', 'OFFLANE', 'FLEX', 'TANK']),
    secondaryRole: z.enum(['RANGED', 'HEALER', 'OFFLANE', 'FLEX', 'TANK']),
    countryCode: z.string().length(2).optional().or(z.literal('')),
  })
  .refine((value) => value.mainRole !== value.secondaryRole, {
    message: 'Main y secundario no pueden ser el mismo rol',
    path: ['secondaryRole'],
  })

type FormData = z.infer<typeof schema>

export function Onboarding() {
  const navigate = useNavigate()
  const { user, updateUser } = useAuthStore()
  const [serverError, setServerError] = useState('')

  const defaultRank = useMemo(
    () => inferInitialRankFromMmr(user?.mmr),
    [user?.mmr],
  )

  const {
    register,
    handleSubmit,
    watch,
    setError,
    clearErrors,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    defaultValues: {
      username: user?.username ?? '',
      initialRank: defaultRank,
      mainRole: (user?.mainRole as PlayerRoleKey | null) ?? undefined,
      secondaryRole: (user?.secondaryRole as PlayerRoleKey | null) ?? undefined,
      countryCode: user?.countryCode ?? '',
    },
  })

  const selectedRank = watch('initialRank')
  const selectedMain = watch('mainRole')
  const selectedSecondary = watch('secondaryRole')

  async function onSubmit(data: FormData) {
    setServerError('')
    clearErrors()

    const parsed = schema.safeParse(data)
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const field = issue.path[0]
        if (typeof field === 'string') {
          setError(field as FieldPath<FormData>, { message: issue.message })
        }
      }
      return
    }

    try {
      const response = await api.post('/users/me/onboarding', parsed.data)
      updateUser(response.data)
      navigate({ to: user?.role === 'ADMIN' ? '/admin' : '/dashboard' })
    } catch (err: any) {
      setServerError(err.response?.data?.error?.message || 'No pudimos completar tu onboarding')
    }
  }

  return (
    <div style={styles.page}>
      <div style={styles.backdropImage} />
      <div style={styles.backdropOverlay} />
      <div style={styles.grid} />

      <div style={styles.shell}>
        <section style={styles.leftPanel}>
          <div style={styles.kicker}>ONBOARDING COMPETITIVO</div>
          <h1 style={styles.title}>
            Ajustá tu
            <br />
            identidad táctica
          </h1>
          <p style={styles.subtitle}>
            Antes de entrar al hub, dejemos listo tu perfil competitivo real:
            rango base, main role y rol secundario.
          </p>

          <div style={styles.checkList}>
            <FeatureItem
              icon={<Target size={16} />}
              title="MMR inicial calibrado"
              text="Solo para arrancar el MVP. Después lo mueve el sistema ELO."
            />
            <FeatureItem
              icon={<ShieldCheck size={16} />}
              title="Roles listos para matchmaking"
              text="Tu identidad competitiva va a ser la fuente principal del producto."
            />
            <FeatureItem
              icon={<Trophy size={16} />}
              title="Entrada directa al dashboard"
              text="Terminás esto una vez y ya quedás listo para jugar."
            />
          </div>
        </section>

        <section style={styles.rightPanel}>
          <div style={styles.panelAccent} />
          <div style={styles.formWrap}>
            <div style={styles.formHeader}>
              <div style={styles.formEyebrow}>Paso final antes del hub</div>
              <h2 style={styles.formTitle}>Configurar perfil competitivo</h2>
              <p style={styles.formText}>
                {user?.email ?? 'Tu cuenta'} ya está autenticada. Confirmá cómo querés entrar a NexusGG.
              </p>
            </div>

            <form onSubmit={handleSubmit(onSubmit)} style={styles.form}>
              <Field label="Username" error={errors.username?.message}>
                <input
                  {...register('username')}
                  placeholder="ZeroX"
                  style={inputStyle}
                />
              </Field>

              <Field
                label="Rango base para calibración inicial"
                error={errors.initialRank?.message}
              >
                <div style={styles.rankGrid}>
                  {INITIAL_RANKS.map((rank) => (
                    <label
                      key={rank.value}
                      style={{
                        ...styles.rankCard,
                        background:
                          selectedRank === rank.value ? `${rank.color}18` : 'rgba(255,255,255,0.03)',
                        borderColor:
                          selectedRank === rank.value ? `${rank.color}88` : 'rgba(255,255,255,0.08)',
                        color: selectedRank === rank.value ? '#f8fafc' : '#94a3b8',
                      }}
                    >
                      <input
                        {...register('initialRank')}
                        type="radio"
                        value={rank.value}
                        style={{ display: 'none' }}
                      />
                      <div style={styles.rankTopline}>
                        <span style={{ ...styles.rankDot, background: rank.color }} />
                        <span>{rank.label}</span>
                      </div>
                      <div style={styles.rankMmr}>Base {rank.mmr} MMR</div>
                    </label>
                  ))}
                </div>
              </Field>

              <RoleSection
                title="Main role"
                selectedRole={selectedMain}
                fieldName="mainRole"
                register={register}
                error={errors.mainRole?.message}
              />

              <RoleSection
                title="Secondary role"
                selectedRole={selectedSecondary}
                fieldName="secondaryRole"
                register={register}
                error={errors.secondaryRole?.message}
              />

              <Field label="Nacionalidad" error={errors.countryCode?.message}>
                <select {...register('countryCode')} style={inputStyle}>
                  <option value="">Seleccionar país</option>
                  {COUNTRY_OPTIONS.map((country) => (
                    <option key={country.code} value={country.code}>
                      {country.flag} {country.name}
                    </option>
                  ))}
                </select>
              </Field>

              {serverError && <div style={styles.serverError}>{serverError}</div>}

              <button type="submit" disabled={isSubmitting} style={styles.submitButton}>
                {isSubmitting ? (
                  'Guardando configuración...'
                ) : (
                  <>
                    <span>Entrar al dashboard</span>
                    <ChevronRight size={18} />
                  </>
                )}
              </button>
            </form>
          </div>
        </section>
      </div>
    </div>
  )
}

function RoleSection({
  title,
  selectedRole,
  fieldName,
  register,
  error,
}: {
  title: string
  selectedRole?: string
  fieldName: 'mainRole' | 'secondaryRole'
  register: ReturnType<typeof useForm<FormData>>['register']
  error?: string
}) {
  return (
    <Field label={title} error={error}>
      <div style={styles.rolesGrid}>
        {ONBOARDING_ROLE_ORDER.map((role) => {
          const meta = getRoleMeta(role)
          const sources = getRoleIconSources(role)
          const selected = selectedRole === role

          return (
            <label
              key={`${fieldName}-${role}`}
              style={{
                ...styles.roleCard,
                borderColor: selected ? `${meta?.accent ?? '#00c8ff'}99` : 'rgba(255,255,255,0.08)',
                background: selected ? 'rgba(8, 16, 28, 0.92)' : 'rgba(255,255,255,0.025)',
                boxShadow: selected ? `0 0 0 1px ${meta?.accent ?? '#00c8ff'}33 inset` : 'none',
              }}
            >
              <input
                {...register(fieldName)}
                type="radio"
                value={role}
                style={{ display: 'none' }}
              />
              {sources ? (
                <img
                  src={sources.primary}
                  onError={(event) => {
                    const target = event.currentTarget
                    if (target.dataset.fallbackApplied === 'true') return
                    target.dataset.fallbackApplied = 'true'
                    target.src = sources.fallback
                  }}
                  alt={meta?.label ?? role}
                  style={styles.roleIcon}
                />
              ) : null}
              <div style={styles.roleLabel}>{meta?.label ?? role}</div>
            </label>
          )
        })}
      </div>
    </Field>
  )
}

function FeatureItem({
  icon,
  title,
  text,
}: {
  icon: React.ReactNode
  title: string
  text: string
}) {
  return (
    <div style={styles.featureItem}>
      <div style={styles.featureIcon}>{icon}</div>
      <div>
        <div style={styles.featureTitle}>{title}</div>
        <div style={styles.featureText}>{text}</div>
      </div>
    </div>
  )
}

function Field({
  label,
  error,
  children,
}: {
  label: string
  error?: string
  children: React.ReactNode
}) {
  return (
    <div>
      <label style={styles.fieldLabel}>{label}</label>
      {children}
      {error ? <div style={styles.fieldError}>{error}</div> : null}
    </div>
  )
}

const inputStyle: CSSProperties = {
  width: '100%',
  padding: '0.9rem 1rem',
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.1)',
  color: '#f8fafc',
  fontSize: '0.92rem',
  fontFamily: 'var(--font-body)',
  outline: 'none',
  boxSizing: 'border-box',
}

const styles: Record<string, CSSProperties> = {
  page: {
    minHeight: '100vh',
    position: 'relative',
    overflow: 'hidden',
    background: '#05070a',
    color: '#f8fafc',
  },
  backdropImage: {
    position: 'absolute',
    inset: 0,
    backgroundImage: 'url(/images/greymane_1920x1200.webp)',
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    opacity: 0.16,
    filter: 'grayscale(35%)',
  },
  backdropOverlay: {
    position: 'absolute',
    inset: 0,
    background:
      'radial-gradient(circle at top left, rgba(0,200,255,0.16), transparent 30%), radial-gradient(circle at bottom right, rgba(124,77,255,0.18), transparent 35%), linear-gradient(120deg, rgba(5,7,10,0.97), rgba(5,7,10,0.88))',
  },
  grid: {
    position: 'absolute',
    inset: 0,
    opacity: 0.045,
    backgroundImage:
      'linear-gradient(rgba(255,255,255,1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,1) 1px, transparent 1px)',
    backgroundSize: '72px 72px',
    pointerEvents: 'none',
  },
  shell: {
    position: 'relative',
    zIndex: 1,
    minHeight: '100vh',
    display: 'grid',
    gridTemplateColumns: 'minmax(320px, 0.95fr) minmax(420px, 1.05fr)',
  },
  leftPanel: {
    padding: 'clamp(2.5rem, 5vw, 4.5rem)',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    gap: '1.4rem',
    borderRight: '1px solid rgba(255,255,255,0.06)',
    background: 'linear-gradient(180deg, rgba(255,255,255,0.02), rgba(255,255,255,0))',
  },
  kicker: {
    display: 'inline-flex',
    width: 'fit-content',
    border: '1px solid rgba(0,200,255,0.32)',
    background: 'rgba(0,200,255,0.08)',
    color: '#00c8ff',
    padding: '0.4rem 0.8rem',
    fontFamily: 'var(--font-display)',
    fontSize: '0.68rem',
    fontWeight: 700,
    letterSpacing: '0.24em',
    textTransform: 'uppercase',
  },
  title: {
    margin: 0,
    fontFamily: 'var(--font-display)',
    fontSize: 'clamp(2.6rem, 5vw, 4.8rem)',
    fontWeight: 900,
    lineHeight: 1.02,
    textTransform: 'uppercase',
  },
  subtitle: {
    margin: 0,
    maxWidth: '620px',
    color: '#a5b4c7',
    fontSize: '1rem',
    lineHeight: 1.8,
  },
  checkList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
    marginTop: '1rem',
    maxWidth: '620px',
  },
  featureItem: {
    display: 'grid',
    gridTemplateColumns: '40px 1fr',
    gap: '0.9rem',
    alignItems: 'start',
    padding: '1rem 1.1rem',
    background: 'rgba(255,255,255,0.03)',
    border: '1px solid rgba(255,255,255,0.06)',
  },
  featureIcon: {
    width: '40px',
    height: '40px',
    display: 'grid',
    placeItems: 'center',
    background: 'rgba(0,200,255,0.12)',
    color: '#00c8ff',
  },
  featureTitle: {
    fontFamily: 'var(--font-display)',
    fontSize: '0.8rem',
    fontWeight: 700,
    letterSpacing: '0.12em',
    textTransform: 'uppercase',
    color: '#f8fafc',
    marginBottom: '0.35rem',
  },
  featureText: {
    fontSize: '0.9rem',
    color: '#94a3b8',
    lineHeight: 1.6,
  },
  rightPanel: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 'clamp(2rem, 4vw, 3.2rem)',
    background: 'rgba(5,7,10,0.78)',
    backdropFilter: 'blur(16px)',
  },
  panelAccent: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '2px',
    background: 'linear-gradient(90deg, transparent, #00c8ff 40%, #7c4dff 70%, transparent)',
  },
  formWrap: {
    width: '100%',
    maxWidth: '760px',
    padding: '1rem 0',
  },
  formHeader: {
    marginBottom: '1.8rem',
  },
  formEyebrow: {
    fontSize: '0.72rem',
    color: '#64748b',
    fontWeight: 700,
    letterSpacing: '0.18em',
    textTransform: 'uppercase',
    marginBottom: '0.7rem',
  },
  formTitle: {
    margin: '0 0 0.6rem 0',
    fontFamily: 'var(--font-display)',
    fontSize: '1.8rem',
    fontWeight: 800,
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
  },
  formText: {
    margin: 0,
    color: '#94a3b8',
    lineHeight: 1.7,
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1.35rem',
  },
  rankGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
    gap: '0.75rem',
  },
  rankCard: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.45rem',
    padding: '0.95rem',
    border: '1px solid rgba(255,255,255,0.08)',
    cursor: 'pointer',
    transition: 'all 0.18s ease',
  },
  rankTopline: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    fontFamily: 'var(--font-display)',
    fontSize: '0.8rem',
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
  },
  rankDot: {
    width: '8px',
    height: '8px',
    flexShrink: 0,
  },
  rankMmr: {
    fontSize: '0.78rem',
    color: '#94a3b8',
  },
  rolesGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(5, minmax(0, 1fr))',
    gap: '0.75rem',
  },
  roleCard: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.7rem',
    minHeight: '132px',
    padding: '0.9rem 0.65rem',
    border: '1px solid rgba(255,255,255,0.08)',
    cursor: 'pointer',
    textAlign: 'center',
    transition: 'all 0.18s ease',
  },
  roleIcon: {
    width: '52px',
    height: '52px',
    objectFit: 'contain',
  },
  roleLabel: {
    fontFamily: 'var(--font-display)',
    fontSize: '0.78rem',
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color: '#e2e8f0',
  },
  submitButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.5rem',
    border: 'none',
    background: 'linear-gradient(90deg, #00c8ff, #7c4dff)',
    color: '#020617',
    padding: '1rem 1.2rem',
    fontFamily: 'var(--font-display)',
    fontSize: '0.9rem',
    fontWeight: 800,
    letterSpacing: '0.14em',
    textTransform: 'uppercase',
    cursor: 'pointer',
    marginTop: '0.4rem',
  },
  serverError: {
    fontSize: '0.8rem',
    color: '#ff8b9b',
    background: 'rgba(255,71,87,0.09)',
    border: '1px solid rgba(255,71,87,0.22)',
    padding: '0.85rem 1rem',
  },
  fieldLabel: {
    display: 'block',
    marginBottom: '0.55rem',
    fontSize: '0.68rem',
    fontWeight: 700,
    letterSpacing: '0.14em',
    textTransform: 'uppercase',
    color: '#64748b',
  },
  fieldError: {
    marginTop: '0.45rem',
    fontSize: '0.74rem',
    color: '#ff7d8c',
  },
}
