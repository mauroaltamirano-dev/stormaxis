import type { ReactNode } from 'react'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { ShieldAlert, ShieldCheck, Swords, TimerReset } from 'lucide-react'
import { getSocket } from '../../lib/socket'
import { playMatchFoundSound } from '../../lib/match-found-sound'
import { RankBadge } from '../RankBadge'
import { parseRankLevel } from '../../lib/ranks'
import { useMatchmakingStore } from '../../stores/matchmaking.store'
import { useAuthStore } from '../../stores/auth.store'

interface Player {
  id: string
  username: string
  avatar: string | null
  rank: string
}

interface Props {
  match: {
    matchId: string
    expiresAt: number
    acceptedBy?: string[]
    acceptedCount?: number
    totalPlayers?: number
    teams: { team1: Player[]; team2: Player[] }
  }
}

const ACCEPT_TIMEOUT = 30
const WARNING_SECONDS = 10

export function MatchFoundModal({ match }: Props) {
  const { clearPendingMatch, resetMatchmaking } = useMatchmakingStore()
  const { user, accessToken } = useAuthStore()
  const navigate = useNavigate()
  const [timeLeft, setTimeLeft] = useState(ACCEPT_TIMEOUT)
  const totalPlayers =
    match.totalPlayers ?? (match.teams.team1.length + match.teams.team2.length)
  const [acceptedBy, setAcceptedBy] = useState<string[]>(match.acceptedBy ?? [])
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isSubmittingAccept, setIsSubmittingAccept] = useState(false)
  const accepted = user ? acceptedBy.includes(user.id) : false
  const isCritical = timeLeft <= WARNING_SECONDS
  const acceptedCount = acceptedBy.length
  const remainingCount = Math.max(0, totalPlayers - acceptedCount)
  const progress = Math.max(0, Math.min(100, (timeLeft / ACCEPT_TIMEOUT) * 100))
  const playersByTeam = useMemo(
    () => ({
      team1: match.teams.team1,
      team2: match.teams.team2,
    }),
    [match.teams.team1, match.teams.team2],
  )

  useEffect(() => {
    void playMatchFoundSound()
  }, [match.matchId])

  useEffect(() => {
    const remaining = Math.max(
      0,
      Math.round((match.expiresAt - Date.now()) / 1000),
    )
    setTimeLeft(remaining)

    const iv = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) {
          clearInterval(iv)
          clearPendingMatch()
          return 0
        }
        return t - 1
      })
    }, 1000)

    return () => clearInterval(iv)
  }, [clearPendingMatch, match.expiresAt])

  useEffect(() => {
    const socket = getSocket()
    const joinMatchRoom = () => {
      socket.emit('match:join', { matchId: match.matchId })
    }

    socket.on('match:accept:ok', () => {
      if (user)
        setAcceptedBy((prev) =>
          prev.includes(user.id) ? prev : [...prev, user.id],
        )
      setIsSubmittingAccept(false)
    })

    socket.on('match:accept:update', (payload: { acceptedBy: string[] }) => {
      setAcceptedBy(payload.acceptedBy)
    })

    socket.on('veto:start', () => {
      clearPendingMatch()
      navigate({ to: '/match/$matchId', params: { matchId: match.matchId } })
    })

    socket.on('matchmaking:cancelled', () => {
      resetMatchmaking()
    })

    const onSocketError = (payload: { code?: string; message?: string }) => {
      if (payload?.code === 'ACCEPT_FAILED') {
        setErrorMessage(payload.message ?? 'No pude aceptar la partida.')
        setIsSubmittingAccept(false)
      }
    }

    socket.on('error', onSocketError)
    socket.on('connect', joinMatchRoom)

    if (socket.connected) {
      joinMatchRoom()
    } else {
      if (accessToken) socket.auth = { token: accessToken }
      socket.connect()
    }

    return () => {
      socket.off('match:accept:ok')
      socket.off('match:accept:update')
      socket.off('veto:start')
      socket.off('matchmaking:cancelled')
      socket.off('error', onSocketError)
      socket.off('connect', joinMatchRoom)
    }
  }, [accessToken, clearPendingMatch, match.matchId, navigate, resetMatchmaking, user])

  function handleAccept() {
    if (accepted || isSubmittingAccept) return

    setErrorMessage(null)
    setIsSubmittingAccept(true)
    const socket = getSocket()

    const emitAccept = () =>
      socket.timeout(8000).emit(
        'match:accept',
        { matchId: match.matchId },
        (
          err: Error | null,
          response?: { ok: boolean; matchId?: string; message?: string },
        ) => {
          if (err) {
            setErrorMessage('No pude confirmar a tiempo. Probá de nuevo.')
            setIsSubmittingAccept(false)
            return
          }

          if (!response?.ok) {
            setErrorMessage(response?.message ?? 'No pude aceptar la partida.')
            setIsSubmittingAccept(false)
            return
          }

          if (user) {
            setAcceptedBy((prev) =>
              prev.includes(user.id) ? prev : [...prev, user.id],
            )
          }
          setIsSubmittingAccept(false)
        },
      )

    if (socket.connected) {
      emitAccept()
      return
    }

    if (accessToken) socket.auth = { token: accessToken }
    socket.connect()

    const connectTimeout = window.setTimeout(() => {
      setErrorMessage(
        'Socket desconectado. No pude reconectar para confirmar la partida.',
      )
      setIsSubmittingAccept(false)
      socket.off('connect', onConnect)
      socket.off('connect_error', onConnectError)
    }, 4000)

    const onConnect = () => {
      window.clearTimeout(connectTimeout)
      socket.off('connect_error', onConnectError)
      emitAccept()
    }

    const onConnectError = () => {
      window.clearTimeout(connectTimeout)
      setErrorMessage('No pude reconectar el socket para aceptar la partida.')
      setIsSubmittingAccept(false)
      socket.off('connect', onConnect)
    }

    socket.once('connect', onConnect)
    socket.once('connect_error', onConnectError)
  }

  function handleDecline() {
    const socket = getSocket()
    socket.emit('match:decline', { matchId: match.matchId })
    resetMatchmaking()
  }

  const yourStatusLabel = accepted
    ? 'Confirmado'
    : isSubmittingAccept
      ? 'Enviando'
      : 'Pendiente'

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
        background:
          'radial-gradient(circle at 50% 0%, rgba(0,200,255,0.14), transparent 34%), rgba(8,12,20,0.86)',
        backdropFilter: 'blur(12px)',
        animation: 'fadeIn 0.2s ease',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '980px',
          border: `1px solid ${isCritical ? 'rgba(255,71,87,0.4)' : 'rgba(0,200,255,0.22)'}`,
          background:
            'linear-gradient(180deg, rgba(17,25,39,0.98), rgba(8,12,20,0.96))',
          boxShadow: isCritical
            ? '0 0 60px rgba(255,71,87,0.10), 0 24px 80px rgba(0,0,0,0.85)'
            : '0 0 60px rgba(0,200,255,0.10), 0 24px 80px rgba(0,0,0,0.85)',
          overflow: 'hidden',
        }}
      >
        <div style={{ height: '4px', background: 'rgba(255,255,255,0.05)' }}>
          <div
            style={{
              height: '100%',
              width: `${progress}%`,
              background: isCritical
                ? 'linear-gradient(90deg, #fb7185, #ff4757)'
                : 'linear-gradient(90deg, #00c8ff, #7c4dff)',
              transition: 'width 1s linear, background 0.3s ease',
            }}
          />
        </div>

        <div style={{ padding: '1.4rem 1.5rem 1.5rem', display: 'grid', gap: '1.15rem' }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(0, 1fr) auto',
              gap: '1rem',
              alignItems: 'start',
            }}
          >
            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  padding: '0.35rem 0.7rem',
                  border: `1px solid ${isCritical ? 'rgba(255,71,87,0.35)' : 'rgba(0,200,255,0.24)'}`,
                  background: isCritical
                    ? 'rgba(255,71,87,0.10)'
                    : 'rgba(0,200,255,0.08)',
                  color: isCritical ? '#fda4af' : '#7dd3fc',
                  fontFamily: 'var(--font-display)',
                  fontSize: '0.7rem',
                  fontWeight: 900,
                  letterSpacing: '0.18em',
                  textTransform: 'uppercase',
                }}
              >
                <Swords size={14} />
                Accept check · Match encontrado
              </div>

              <div
                style={{
                  marginTop: '0.9rem',
                  color: '#fff',
                  fontFamily: 'var(--font-display)',
                  fontSize: 'clamp(1.8rem, 4vw, 3rem)',
                  fontWeight: 900,
                  lineHeight: 0.9,
                  letterSpacing: '0.04em',
                  textTransform: 'uppercase',
                }}
              >
                {accepted ? 'Confirmado.' : isCritical ? 'Última llamada.' : 'La lobby está lista.'}
              </div>

              <p
                style={{
                  marginTop: '0.7rem',
                  maxWidth: '680px',
                  color: 'rgba(232,244,255,0.68)',
                  fontSize: '0.95rem',
                  lineHeight: 1.6,
                }}
              >
                {accepted
                  ? 'Tu lugar quedó bloqueado. Esperá a que el resto confirme y te mandamos directo al match room.'
                  : isCritical
                    ? 'Si no confirmás ahora, la partida se cae para todos y el lobby vuelve a buscar.'
                    : 'Los diez jugadores ya fueron agrupados. Confirmá tu presencia para abrir veto de mapas y entrar al room real.'}
              </p>
            </div>

            <div
              style={{
                minWidth: '170px',
                border: `1px solid ${isCritical ? 'rgba(255,71,87,0.35)' : 'rgba(0,200,255,0.24)'}`,
                background: 'rgba(2,6,14,0.8)',
                padding: '0.9rem 1rem',
                textAlign: 'right',
                boxShadow: isCritical ? '0 0 24px rgba(255,71,87,0.10)' : 'none',
              }}
            >
              <div
                style={{
                  color: 'rgba(232,244,255,0.42)',
                  fontSize: '0.62rem',
                  letterSpacing: '0.2em',
                  textTransform: 'uppercase',
                  fontWeight: 900,
                }}
              >
                Tiempo restante
              </div>
              <div
                style={{
                  marginTop: '0.35rem',
                  color: isCritical ? '#ff8e9b' : '#fff',
                  fontFamily: 'var(--font-display)',
                  fontSize: '2.35rem',
                  lineHeight: 1,
                  fontWeight: 900,
                  letterSpacing: '0.08em',
                }}
              >
                0:{String(timeLeft).padStart(2, '0')}
              </div>
              <div
                style={{
                  marginTop: '0.42rem',
                  color: isCritical ? '#fda4af' : '#7dd3fc',
                  fontSize: '0.74rem',
                  fontWeight: 800,
                  textTransform: 'uppercase',
                  letterSpacing: '0.1em',
                }}
              >
                {isCritical ? 'ventana crítica' : 'ventana estable'}
              </div>
            </div>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
              gap: '0.75rem',
            }}
          >
            <SignalCard
              label='Aceptados'
              value={`${acceptedCount}/${totalPlayers}`}
              sub={acceptedCount === totalPlayers ? 'Lobby cerrado' : 'Faltan confirmaciones'}
              tone={acceptedCount === totalPlayers ? '#4ade80' : '#7dd3fc'}
              icon={<ShieldCheck size={16} />}
            />
            <SignalCard
              label='Pendientes'
              value={String(remainingCount)}
              sub={remainingCount === 0 ? 'Todos listos' : 'Jugadores por responder'}
              tone={remainingCount === 0 ? '#4ade80' : isCritical ? '#ff8e9b' : '#fbbf24'}
              icon={<TimerReset size={16} />}
            />
            <SignalCard
              label='Tu estado'
              value={yourStatusLabel}
              sub={accepted ? 'Esperando transición' : 'Hace click para asegurar slot'}
              tone={accepted ? '#4ade80' : isSubmittingAccept ? '#7dd3fc' : '#e2e8f0'}
              icon={accepted ? <ShieldCheck size={16} /> : <ShieldAlert size={16} />}
            />
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(0, 1fr) auto minmax(0, 1fr)',
              gap: '1rem',
              alignItems: 'stretch',
            }}
          >
            <TeamPanel
              title='Blue side'
              subtitle='Equipo 1'
              tone='#00c8ff'
              players={playersByTeam.team1}
              acceptedBy={acceptedBy}
              currentUserId={user?.id ?? null}
            />
            <div
              style={{
                display: 'grid',
                placeItems: 'center',
                color: 'rgba(232,244,255,0.25)',
                fontFamily: 'var(--font-display)',
                fontWeight: 900,
                letterSpacing: '0.12em',
                fontSize: '1.4rem',
              }}
            >
              VS
            </div>
            <TeamPanel
              title='Red side'
              subtitle='Equipo 2'
              tone='#ff4757'
              players={playersByTeam.team2}
              acceptedBy={acceptedBy}
              currentUserId={user?.id ?? null}
              align='right'
            />
          </div>

          {errorMessage && (
            <div
              style={{
                border: '1px solid rgba(255,71,87,0.28)',
                background: 'rgba(127,29,29,0.16)',
                color: '#fecaca',
                padding: '0.85rem 0.95rem',
                fontSize: '0.88rem',
                fontWeight: 700,
              }}
            >
              {errorMessage}
            </div>
          )}

          {accepted ? (
            <div
              style={{
                border: '1px solid rgba(74,222,128,0.24)',
                background: 'linear-gradient(90deg, rgba(74,222,128,0.12), rgba(2,6,14,0.28))',
                color: '#bbf7d0',
                padding: '1rem 1.1rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '1rem',
                flexWrap: 'wrap',
              }}
            >
              <div>
                <div
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontSize: '0.95rem',
                    fontWeight: 900,
                    letterSpacing: '0.1em',
                    textTransform: 'uppercase',
                  }}
                >
                  Slot asegurado
                </div>
                <div style={{ marginTop: '0.25rem', fontSize: '0.85rem', color: 'rgba(220,252,231,0.82)' }}>
                  No cierres la pestaña. Te movemos al veto apenas cierre la confirmación global.
                </div>
              </div>
              <div
                style={{
                  color: '#4ade80',
                  fontFamily: 'var(--font-display)',
                  fontSize: '0.92rem',
                  fontWeight: 900,
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                }}
              >
                Esperando {remainingCount} respuesta(s)
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button
                onClick={handleDecline}
                disabled={isSubmittingAccept}
                style={{
                  flex: 1,
                  padding: '0.95rem 1rem',
                  background: 'rgba(255,71,87,0.08)',
                  color: '#fecaca',
                  border: '1px solid rgba(255,71,87,0.24)',
                  fontFamily: 'var(--font-display)',
                  fontSize: '0.9rem',
                  fontWeight: 900,
                  letterSpacing: '0.12em',
                  textTransform: 'uppercase',
                  cursor: isSubmittingAccept ? 'not-allowed' : 'pointer',
                  opacity: isSubmittingAccept ? 0.7 : 1,
                }}
              >
                Rechazar
              </button>
              <button
                onClick={handleAccept}
                disabled={accepted || isSubmittingAccept}
                style={{
                  flex: 1.9,
                  padding: '0.95rem 1rem',
                  background: isCritical
                    ? 'linear-gradient(90deg, #ff5f6d, #ff4757)'
                    : 'linear-gradient(90deg, #00c8ff, #7c4dff)',
                  color: '#020617',
                  border: 'none',
                  fontFamily: 'var(--font-display)',
                  fontSize: '0.92rem',
                  fontWeight: 900,
                  letterSpacing: '0.16em',
                  textTransform: 'uppercase',
                  boxShadow: isCritical
                    ? '0 0 26px rgba(255,71,87,0.24)'
                    : '0 0 26px rgba(0,200,255,0.24)',
                  cursor: accepted || isSubmittingAccept ? 'not-allowed' : 'pointer',
                  opacity: accepted || isSubmittingAccept ? 0.65 : 1,
                }}
              >
                {isSubmittingAccept ? 'Enviando confirmación…' : 'Aceptar partida'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function SignalCard({
  label,
  value,
  sub,
  tone,
  icon,
}: {
  label: string
  value: string
  sub: string
  tone: string
  icon: ReactNode
}) {
  return (
    <div
      style={{
        border: '1px solid rgba(232,244,255,0.08)',
        background: 'rgba(2,6,14,0.5)',
        padding: '0.85rem 0.95rem',
        display: 'grid',
        gap: '0.35rem',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '0.75rem',
          color: 'rgba(232,244,255,0.38)',
          fontSize: '0.64rem',
          fontWeight: 900,
          letterSpacing: '0.16em',
          textTransform: 'uppercase',
        }}
      >
        <span>{label}</span>
        <span style={{ color: tone }}>{icon}</span>
      </div>
      <div
        style={{
          color: tone,
          fontFamily: 'var(--font-display)',
          fontSize: '1.45rem',
          lineHeight: 1,
          fontWeight: 900,
        }}
      >
        {value}
      </div>
      <div style={{ color: 'rgba(232,244,255,0.5)', fontSize: '0.78rem' }}>
        {sub}
      </div>
    </div>
  )
}

function TeamPanel({
  title,
  subtitle,
  tone,
  players,
  acceptedBy,
  currentUserId,
  align = 'left',
}: {
  title: string
  subtitle: string
  tone: string
  players: Player[]
  acceptedBy: string[]
  currentUserId: string | null
  align?: 'left' | 'right'
}) {
  const isRight = align === 'right'

  return (
    <div
      style={{
        border: `1px solid ${tone}2E`,
        background: `linear-gradient(180deg, ${tone}12, rgba(2,6,14,0.78) 28%, rgba(2,6,14,0.96))`,
        padding: '0.9rem',
        display: 'grid',
        gap: '0.7rem',
      }}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: isRight ? 'row-reverse' : 'row',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: '1rem',
        }}
      >
        <div style={{ textAlign: isRight ? 'right' : 'left' }}>
          <div
            style={{
              color: tone,
              fontFamily: 'var(--font-display)',
              fontSize: '0.72rem',
              fontWeight: 900,
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
            }}
          >
            {title}
          </div>
          <div style={{ color: 'rgba(232,244,255,0.42)', fontSize: '0.76rem', marginTop: '0.15rem' }}>
            {subtitle}
          </div>
        </div>
        <div
          style={{
            color: 'rgba(232,244,255,0.40)',
            fontFamily: 'var(--font-display)',
            fontSize: '0.68rem',
            fontWeight: 800,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
          }}
        >
          {players.length} slots
        </div>
      </div>

      <div style={{ display: 'grid', gap: '0.45rem' }}>
        {players.map((player) => (
          <PlayerRow
            key={player.id}
            player={player}
            accepted={acceptedBy.includes(player.id)}
            self={currentUserId === player.id}
            align={align}
          />
        ))}
      </div>
    </div>
  )
}

function PlayerRow({
  player,
  accepted,
  self,
  align = 'left',
}: {
  player: Player
  accepted: boolean
  self: boolean
  align?: 'left' | 'right'
}) {
  const isRight = align === 'right'

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: isRight ? 'auto 1fr auto' : 'auto 1fr auto',
        alignItems: 'center',
        gap: '0.65rem',
        border: `1px solid ${accepted ? 'rgba(74,222,128,0.22)' : 'rgba(255,255,255,0.06)'}`,
        background: accepted ? 'rgba(74,222,128,0.08)' : 'rgba(255,255,255,0.02)',
        padding: '0.55rem 0.65rem',
      }}
    >
      {isRight ? (
        <>
          <StatusChip accepted={accepted} />
          <div style={{ minWidth: 0, textAlign: 'right' }}>
            <div
              style={{
                color: '#fff',
                fontWeight: 800,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {player.username} {self ? '(vos)' : ''}
            </div>
            <div style={{ color: 'rgba(232,244,255,0.36)', fontSize: '0.74rem' }}>
              {accepted ? 'Confirmado' : 'Esperando respuesta'}
            </div>
          </div>
          <RankBadge
            level={parseRankLevel(player.rank)}
            size='sm'
            showLabel={false}
            showMmr={false}
            glow={accepted ? 'medium' : 'soft'}
          />
        </>
      ) : (
        <>
          <RankBadge
            level={parseRankLevel(player.rank)}
            size='sm'
            showLabel={false}
            showMmr={false}
            glow={accepted ? 'medium' : 'soft'}
          />
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                color: '#fff',
                fontWeight: 800,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {player.username} {self ? '(vos)' : ''}
            </div>
            <div style={{ color: 'rgba(232,244,255,0.36)', fontSize: '0.74rem' }}>
              {accepted ? 'Confirmado' : 'Esperando respuesta'}
            </div>
          </div>
          <StatusChip accepted={accepted} />
        </>
      )}
    </div>
  )
}

function StatusChip({ accepted }: { accepted: boolean }) {
  return (
    <div
      style={{
        minWidth: '88px',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '0.35rem',
        border: `1px solid ${accepted ? 'rgba(74,222,128,0.28)' : 'rgba(251,191,36,0.18)'}`,
        background: accepted ? 'rgba(74,222,128,0.10)' : 'rgba(251,191,36,0.06)',
        color: accepted ? '#86efac' : '#fcd34d',
        padding: '0.26rem 0.5rem',
        fontFamily: 'var(--font-display)',
        fontSize: '0.62rem',
        fontWeight: 900,
        letterSpacing: '0.12em',
        textTransform: 'uppercase',
      }}
    >
      {accepted ? 'OK' : 'WAIT'}
    </div>
  )
}
