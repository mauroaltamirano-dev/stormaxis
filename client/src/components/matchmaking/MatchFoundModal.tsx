import { useState, useEffect } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { getSocket } from '../../lib/socket'
import { playMatchFoundSound } from '../../lib/match-found-sound'
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

export function MatchFoundModal({ match }: Props) {
  const { clearPendingMatch, resetMatchmaking } = useMatchmakingStore()
  const { user, accessToken } = useAuthStore()
  const navigate = useNavigate()
  const [timeLeft, setTimeLeft] = useState(ACCEPT_TIMEOUT)
  const totalPlayers = match.totalPlayers ?? (match.teams.team1.length + match.teams.team2.length)
  const [acceptedBy, setAcceptedBy] = useState<string[]>(match.acceptedBy ?? [])
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isSubmittingAccept, setIsSubmittingAccept] = useState(false)
  const accepted = user ? acceptedBy.includes(user.id) : false

  useEffect(() => {
    void playMatchFoundSound()
  }, [match.matchId])

  // Countdown
  useEffect(() => {
    const remaining = Math.max(0, Math.round((match.expiresAt - Date.now()) / 1000))
    setTimeLeft(remaining)

    const iv = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) { clearInterval(iv); clearPendingMatch(); return 0 }
        return t - 1
      })
    }, 1000)
    return () => clearInterval(iv)
  }, [clearPendingMatch, match.expiresAt])

  // Socket: track accepted count & route to match room
  useEffect(() => {
    const socket = getSocket()
    const joinMatchRoom = () => {
      socket.emit('match:join', { matchId: match.matchId })
    }

    socket.on('match:accept:ok', () => {
      if (user) setAcceptedBy((prev) => (prev.includes(user.id) ? prev : [...prev, user.id]))
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
    const emitAccept = () => socket.timeout(8000).emit(
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
          setAcceptedBy((prev) => (prev.includes(user.id) ? prev : [...prev, user.id]))
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
      setErrorMessage('Socket desconectado. No pude reconectar para confirmar la partida.')
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

  const progress = (timeLeft / ACCEPT_TIMEOUT) * 100

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(8,12,20,0.85)',
      backdropFilter: 'blur(8px)',
      animation: 'fadeIn 0.2s ease',
    }}>
      <div style={{
        width: '100%', maxWidth: '520px', margin: '0 16px',
        background: 'var(--nexus-card)',
        border: '1px solid rgba(0,200,255,0.25)',
        borderRadius: '16px', overflow: 'hidden',
        boxShadow: '0 0 60px rgba(0,200,255,0.12), 0 24px 60px rgba(0,0,0,0.8)',
      }}>
        {/* Timer bar */}
        <div style={{ height: '3px', background: 'rgba(255,255,255,0.06)' }}>
          <div style={{
            height: '3px',
            width: `${progress}%`,
            background: timeLeft > 10 ? 'var(--nexus-accent)' : 'var(--nexus-red)',
            transition: 'width 1s linear, background 0.3s',
          }} />
        </div>

        <div style={{ padding: '32px 32px 28px' }}>
          {/* Header */}
          <div style={{ textAlign: 'center', marginBottom: '28px' }}>
            <div style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              width: '56px', height: '56px', borderRadius: '50%',
              background: 'var(--nexus-accent-dim)',
              border: '2px solid var(--nexus-accent)',
              fontSize: '28px', marginBottom: '12px',
              animation: 'pulse-logo 1.5s ease-in-out infinite',
            }}>⚔</div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: '22px', fontWeight: 700, letterSpacing: '2px', color: 'var(--nexus-text)' }}>
              ¡PARTIDA ENCONTRADA!
            </div>
            <div style={{ fontSize: '12px', color: 'var(--nexus-muted)', marginTop: '4px' }}>
              {totalPlayers} jugadores listos — aceptá antes de que expire el tiempo
            </div>
            <div style={{ fontSize: '13px', color: '#7dd3fc', marginTop: '10px', fontWeight: 700 }}>
              Aceptaron {acceptedBy.length}/{totalPlayers}
            </div>
          </div>

          {/* Teams */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: '12px', alignItems: 'center', marginBottom: '24px' }}>
            {/* Team 1 */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: '10px', fontWeight: 700, letterSpacing: '2px', color: 'var(--nexus-accent)', textTransform: 'uppercase', marginBottom: '4px' }}>
                Equipo 1
              </div>
              {match.teams.team1.map((p) => (
                <PlayerRow key={p.id} player={p} />
              ))}
            </div>

            {/* VS */}
            <div style={{ fontFamily: 'var(--font-display)', fontSize: '20px', fontWeight: 700, color: 'var(--nexus-faint)', textAlign: 'center' }}>
              VS
            </div>

            {/* Team 2 */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', alignItems: 'flex-end' }}>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: '10px', fontWeight: 700, letterSpacing: '2px', color: 'var(--nexus-red)', textTransform: 'uppercase', marginBottom: '4px', textAlign: 'right' }}>
                Equipo 2
              </div>
              {match.teams.team2.map((p) => (
                <PlayerRow key={p.id} player={p} right />
              ))}
            </div>
          </div>

          {/* Timer */}
          <div style={{ textAlign: 'center', marginBottom: '20px' }}>
            <span style={{
              fontFamily: 'var(--font-display)', fontSize: '36px', fontWeight: 700,
              color: timeLeft > 10 ? 'var(--nexus-text)' : 'var(--nexus-red)',
              transition: 'color 0.3s',
            }}>
              0:{timeLeft.toString().padStart(2, '0')}
            </span>
          </div>

          {errorMessage && (
            <div style={{
              marginBottom: '16px',
              textAlign: 'center',
              padding: '12px 14px',
              background: 'rgba(255,71,87,0.08)',
              border: '1px solid rgba(255,71,87,0.22)',
              borderRadius: '8px',
              color: '#fecaca',
              fontSize: '13px',
              fontWeight: 700,
            }}>
              {errorMessage}
            </div>
          )}

          {/* Buttons */}
          {accepted ? (
            <div style={{ textAlign: 'center', padding: '16px', background: 'rgba(0,230,118,0.08)', border: '1px solid rgba(0,230,118,0.2)', borderRadius: '8px' }}>
              <div style={{ color: 'var(--nexus-green)', fontFamily: 'var(--font-display)', fontSize: '14px', fontWeight: 700, letterSpacing: '1px' }}>
                ✓ ACEPTASTE — Esperando a los demás jugadores...
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={handleDecline}
                style={{
                  flex: 1, padding: '13px',
                  background: 'rgba(255,71,87,0.1)', color: 'var(--nexus-red)',
                  border: '1px solid rgba(255,71,87,0.3)', borderRadius: '8px',
                  fontFamily: 'var(--font-display)', fontSize: '14px', fontWeight: 700,
                  letterSpacing: '1px', textTransform: 'uppercase', cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
              >
                Rechazar
              </button>
              <button
                onClick={handleAccept}
                disabled={accepted || isSubmittingAccept}
                style={{
                  flex: 2, padding: '13px',
                  background: accepted || isSubmittingAccept ? 'rgba(0,200,255,0.25)' : 'var(--nexus-accent)', color: '#080c14',
                  border: 'none', borderRadius: '8px',
                  fontFamily: 'var(--font-display)', fontSize: '14px', fontWeight: 700,
                  letterSpacing: '2px', textTransform: 'uppercase', cursor: accepted || isSubmittingAccept ? 'not-allowed' : 'pointer',
                  transition: 'all 0.2s',
                  boxShadow: '0 4px 20px rgba(0,200,255,0.3)',
                }}
              >
                {accepted ? '✓ CONFIRMADO' : isSubmittingAccept ? 'ENVIANDO...' : '⚡ ACEPTAR PARTIDA'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function PlayerRow({ player, right }: { player: Player; right?: boolean }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '6px',
      flexDirection: right ? 'row-reverse' : 'row',
    }}>
      <div style={{
        width: '24px', height: '24px', borderRadius: '50%',
        background: 'var(--nexus-surface)', border: '1px solid var(--nexus-border)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '10px', fontWeight: 700, fontFamily: 'var(--font-display)',
        color: 'var(--nexus-accent)', flexShrink: 0,
      }}>
        {player.username.slice(0, 2).toUpperCase()}
      </div>
      <span style={{ fontSize: '12px', fontWeight: 500 }}>{player.username}</span>
    </div>
  )
}
