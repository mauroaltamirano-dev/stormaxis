import { useEffect, useState } from 'react'
import { useNavigate, useParams } from '@tanstack/react-router'
import { ActiveMatchRoom } from '../components/matchmaking/ActiveMatchRoom'
import { api } from '../lib/api'
import { getSocket } from '../lib/socket'
import { useAuthStore } from '../stores/auth.store'
import { useMatchmakingStore } from '../stores/matchmaking.store'

const DISMISSED_ACTIVE_MATCH_KEY = 'nexusgg.dismissedActiveMatchId'

function upsertVote(votes: Array<{ userId: string; winner: 1 | 2 }>, userId: string, winner: 1 | 2) {
  const next = votes.filter((vote) => vote.userId !== userId)
  next.push({ userId, winner })
  return next
}

function upsertMvpVote(
  votes: Array<{ userId: string; nomineeUserId: string }>,
  userId: string,
  nomineeUserId: string,
) {
  const next = votes.filter((vote) => vote.userId !== userId)
  next.push({ userId, nomineeUserId })
  return next
}

type MatchChatMessage = {
  id: string
  userId: string
  username: string
  avatar: string | null
  content: string
  channel: 'GLOBAL' | 'TEAM'
  team: 1 | 2 | null
  timestamp: string
}

function normalizeChatMessage(raw: any): MatchChatMessage | null {
  const id = typeof raw?.id === 'string' ? raw.id : null
  const userId = typeof raw?.userId === 'string' ? raw.userId : null
  const username = typeof raw?.username === 'string'
    ? raw.username
    : typeof raw?.user?.username === 'string'
      ? raw.user.username
      : null
  const avatar = typeof raw?.avatar === 'string'
    ? raw.avatar
    : typeof raw?.user?.avatar === 'string'
      ? raw.user.avatar
      : null
  const content = typeof raw?.content === 'string' ? raw.content : null
  const timestampRaw = raw?.timestamp ?? raw?.createdAt ?? raw?.updatedAt ?? null

  if (!id || !userId || !username || !content || !timestampRaw) return null
  const timestampDate = new Date(timestampRaw)
  if (Number.isNaN(timestampDate.getTime())) return null

  const rawChannel = typeof raw?.channel === 'string' ? raw.channel.toUpperCase() : 'GLOBAL'
  const channel = rawChannel === 'TEAM' ? 'TEAM' : 'GLOBAL'
  const team = raw?.team === 1 || raw?.team === 2 ? raw.team : null

  return {
    id,
    userId,
    username,
    avatar: avatar ?? null,
    content,
    channel,
    team,
    timestamp: timestampDate.toISOString(),
  }
}

function mergeChatMessages(
  current: MatchChatMessage[],
  incoming: MatchChatMessage[],
): MatchChatMessage[] {
  const byId = new Map<string, MatchChatMessage>()
  for (const message of [...current, ...incoming]) {
    byId.set(message.id, message)
  }
  return [...byId.values()].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
  )
}

export function MatchRoom() {
  const { matchId } = useParams({ strict: false }) as { matchId: string }
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const resetMatchmaking = useMatchmakingStore((state) => state.resetMatchmaking)
  const [match, setMatch] = useState<any | null>(null)
  const [chatMessages, setChatMessages] = useState<MatchChatMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    if (!user || !matchId) return

    const socket = getSocket()
    const syncMatch = (updater: (prev: any) => any) => {
      setMatch((prev: any) => (prev ? updater(prev) : prev))
    }

    const joinMatchRoom = () => socket.emit('match:join', { matchId })
    socket.on('connect', joinMatchRoom)
    if (socket.connected) {
      joinMatchRoom()
    } else {
      socket.connect()
    }

    const onMatchState = (payload: any) => {
      setMatch(payload)

      if (Array.isArray(payload?.messages)) {
        const normalized = payload.messages
          .map(normalizeChatMessage)
          .filter((message: MatchChatMessage | null): message is MatchChatMessage => message != null)
        setChatMessages(normalized)
      }
    }
    const onVetoStart = (payload: any) => {
      syncMatch((prev) => ({
        ...prev,
        status: 'VETOING',
        runtime: {
          ...(prev.runtime ?? {}),
          veto: {
            remainingMaps: payload?.remainingMaps ?? prev.runtime?.veto?.remainingMaps ?? [],
            currentTurn: payload?.currentTurn ?? 1,
            vetoOrder: payload?.order ?? prev.runtime?.veto?.vetoOrder ?? [],
            vetoIndex: payload?.vetoIndex ?? 0,
            timeoutAt: payload?.timeoutAt ?? prev.runtime?.veto?.timeoutAt,
            captains: payload?.captains ?? prev.runtime?.veto?.captains ?? {},
          },
          voteCounts: prev.runtime?.voteCounts ?? { team1Votes: 0, team2Votes: 0, total: 0 },
        },
      }))
    }
    const onVetoTurn = (payload: any) => {
      syncMatch((prev) => ({
        ...prev,
        status: 'VETOING',
        runtime: {
          ...(prev.runtime ?? {}),
          veto: {
            ...(prev.runtime?.veto ?? {}),
            currentTurn: payload.team,
            vetoIndex: payload.vetoIndex ?? prev.runtime?.veto?.vetoIndex ?? 0,
            vetoOrder: payload.vetoOrder ?? prev.runtime?.veto?.vetoOrder ?? [],
            timeoutAt: payload.timeoutAt,
            remainingMaps: payload.remainingMaps,
            captains: payload.captains
              ? payload.captains
              : {
                  ...(prev.runtime?.veto?.captains ?? {}),
                  [payload.team]: payload.captainId,
                },
          },
          voteCounts: prev.runtime?.voteCounts ?? { team1Votes: 0, team2Votes: 0, total: 0 },
        },
      }))
    }
    const onVetoAction = (payload: any) => {
      syncMatch((prev) => ({
        ...prev,
        vetoes: [...(prev.vetoes ?? []), {
          mapId: payload.mapId,
          mapName: payload.mapName,
          team: payload.team,
          auto: payload.auto,
          order: (prev.vetoes ?? []).length,
        }],
        runtime: {
          ...(prev.runtime ?? {}),
          veto: prev.runtime?.veto
            ? {
                ...prev.runtime.veto,
                remainingMaps: payload.remainingMaps,
              }
            : prev.runtime?.veto ?? null,
          voteCounts: prev.runtime?.voteCounts ?? { team1Votes: 0, team2Votes: 0, total: 0 },
        },
      }))
    }
    const onVetoComplete = (payload: any) => {
      syncMatch((prev) => ({
        ...prev,
        status: 'PLAYING',
        selectedMap: payload.selectedMap,
        runtime: {
          ...(prev.runtime ?? {}),
          veto: null,
        },
      }))
    }
    const onReadyUpdate = (payload: any) => {
      syncMatch((prev) => ({
        ...prev,
        runtime: {
          ...(prev.runtime ?? {}),
          ready: payload,
          voteCounts: prev.runtime?.voteCounts ?? { team1Votes: 0, team2Votes: 0, total: 0 },
        },
      }))
    }
    const onFinishUpdate = (payload: any) => {
      syncMatch((prev) => ({
        ...prev,
        runtime: {
          ...(prev.runtime ?? {}),
          finish: payload,
          voteCounts: prev.runtime?.voteCounts ?? { team1Votes: 0, team2Votes: 0, total: 0 },
        },
      }))
    }
    const onVoteStart = (payload: any) => {
      syncMatch((prev) => ({
        ...prev,
        status: 'VOTING',
        runtime: {
          ...(prev.runtime ?? {}),
          voting: { expiresAt: payload.expiresAt, totalPlayers: payload.totalPlayers },
          voteCounts: {
            team1Votes: payload.team1Votes,
            team2Votes: payload.team2Votes,
            total: payload.total,
          },
          mvpVoteCounts: prev.runtime?.mvpVoteCounts ?? [],
        },
      }))
    }
    const onVoteUpdate = (payload: any) => {
      syncMatch((prev) => ({
        ...prev,
        runtime: {
          ...(prev.runtime ?? {}),
          voteCounts: payload,
          mvpVoteCounts: prev.runtime?.mvpVoteCounts ?? [],
        },
      }))
    }
    const onVoteResult = (payload: any) => {
      syncMatch((prev) => ({
        ...prev,
        winner: payload.winner,
        runtime: {
          ...(prev.runtime ?? {}),
          voteCounts: {
            team1Votes: payload.team1Votes,
            team2Votes: payload.team2Votes,
            total: payload.total,
          },
          mvpVoting: payload.mvpVoting ?? prev.runtime?.mvpVoting ?? null,
          mvpVoteCounts: prev.runtime?.mvpVoteCounts ?? [],
        },
      }))
    }
    const onMvpStart = (payload: any) => {
      syncMatch((prev) => ({
        ...prev,
        winner: payload.winner ?? prev.winner,
        runtime: {
          ...(prev.runtime ?? {}),
          mvpVoting: {
            expiresAt: payload.expiresAt,
            totalPlayers: payload.totalPlayers,
          },
          mvpVoteCounts: payload.counts ?? [],
        },
      }))
    }
    const onMvpUpdate = (payload: any) => {
      syncMatch((prev) => ({
        ...prev,
        runtime: {
          ...(prev.runtime ?? {}),
          mvpVoteCounts: payload.counts ?? [],
        },
      }))
    }
    const onMatchComplete = (payload: any) => {
      syncMatch((prev) => ({
        ...prev,
        status: 'COMPLETED',
        winner: payload.winner,
        mvpUserId: payload.mvpUserId ?? prev.mvpUserId ?? null,
        duration: payload.duration,
        players: prev.players.map((player: any) => ({
          ...player,
          mmrDelta: payload.eloDeltas?.[player.userId] ?? player.mmrDelta ?? 0,
        })),
      }))
    }
    const onCancelUpdate = (payload: any) => {
      syncMatch((prev) => ({
        ...prev,
        runtime: {
          ...(prev.runtime ?? {}),
          cancel: payload,
        },
      }))
    }
    const onCancelled = () => {
      syncMatch((prev) => ({ ...prev, status: 'CANCELLED' }))
    }
    const onChatMessage = (payload: any) => {
      const normalized = normalizeChatMessage(payload)
      if (!normalized) return
      setChatMessages((prev) => mergeChatMessages(prev, [normalized]))
    }
    const onDiscordVoice = (payload: any) => {
      if (!payload || payload.matchId !== matchId) return
      syncMatch((prev) => ({
        ...prev,
        discordVoice: payload.discordVoice ?? prev.discordVoice ?? null,
      }))
    }

    socket.on('match:state', onMatchState)
    socket.on('veto:start', onVetoStart)
    socket.on('veto:turn', onVetoTurn)
    socket.on('veto:action', onVetoAction)
    socket.on('veto:complete', onVetoComplete)
    socket.on('match:ready_update', onReadyUpdate)
    socket.on('match:finish:update', onFinishUpdate)
    socket.on('vote:start', onVoteStart)
    socket.on('vote:update', onVoteUpdate)
    socket.on('vote:result', onVoteResult)
    socket.on('mvp:start', onMvpStart)
    socket.on('mvp:update', onMvpUpdate)
    socket.on('match:complete', onMatchComplete)
    socket.on('match:cancel:update', onCancelUpdate)
    socket.on('match:cancelled', onCancelled)
    socket.on('matchmaking:cancelled', onCancelled)
    socket.on('chat:message', onChatMessage)
    socket.on('match:discord_voice', onDiscordVoice)

    api
      .get(`/matches/${matchId}`)
      .then(({ data }) => {
        setMatch(data)
        setLoadError(null)
      })
      .catch(() => {
        setLoadError('No pude recuperar el estado del match room.')
      })
      .finally(() => setLoading(false))

    api.get(`/matches/${matchId}/chat`)
      .then(({ data }) => {
        const normalized = Array.isArray(data)
          ? data
              .map(normalizeChatMessage)
              .filter((message): message is MatchChatMessage => message != null)
          : []
        setChatMessages((prev) => mergeChatMessages(prev, normalized))
      })
      .catch(() => {})

    return () => {
      socket.off('match:state', onMatchState)
      socket.off('veto:start', onVetoStart)
      socket.off('veto:turn', onVetoTurn)
      socket.off('veto:action', onVetoAction)
      socket.off('veto:complete', onVetoComplete)
      socket.off('match:ready_update', onReadyUpdate)
      socket.off('match:finish:update', onFinishUpdate)
      socket.off('vote:start', onVoteStart)
      socket.off('vote:update', onVoteUpdate)
      socket.off('vote:result', onVoteResult)
      socket.off('mvp:start', onMvpStart)
      socket.off('mvp:update', onMvpUpdate)
      socket.off('match:complete', onMatchComplete)
      socket.off('match:cancel:update', onCancelUpdate)
      socket.off('match:cancelled', onCancelled)
      socket.off('matchmaking:cancelled', onCancelled)
      socket.off('chat:message', onChatMessage)
      socket.off('match:discord_voice', onDiscordVoice)
      socket.off('connect', joinMatchRoom)
    }
  }, [matchId, navigate, user])

  useEffect(() => {
    if (!match?.status) return
    if (['VETOING', 'PLAYING', 'VOTING', 'COMPLETED', 'CANCELLED'].includes(match.status)) {
      resetMatchmaking()
    }
  }, [match?.status, resetMatchmaking])

  if (!user) return null

  if (loading) {
    return (
      <RoomShellCard
        eyebrow='Match room'
        title='Sincronizando sala'
        description='Estamos trayendo el estado vivo del match, los equipos y el chat operativo.'
      />
    )
  }

  if (loadError || !match) {
    return (
      <RoomShellCard
        eyebrow='Match room'
        title='Sala no disponible'
        description={loadError ?? 'No se pudo abrir la sala solicitada.'}
        actionLabel='Volver al dashboard'
        onAction={() => navigate({ to: '/dashboard' })}
      />
    )
  }

  return (
    <ActiveMatchRoom
      currentUserId={user.id}
      currentUserRole={user.role}
      match={match}
      chatMessages={chatMessages}
      onSendMessage={(content, channel) => {
        getSocket().emit('chat:send', { matchId: match.id, content, channel })
      }}
      onBanMap={(mapId) => getSocket().emit('veto:ban', { matchId: match.id, mapId })}
      onReady={() => getSocket().emit('match:ready', { matchId: match.id })}
      onFinishMatch={() => getSocket().emit('match:finish', { matchId: match.id })}
      onVote={(winner) => {
        getSocket().emit('vote:cast', { matchId: match.id, winner })
        setMatch((prev: any) => ({
          ...prev,
          votes: upsertVote(prev?.votes ?? [], user.id, winner),
        }))
      }}
      onMvpVote={(nomineeUserId) => {
        getSocket().emit('mvp:cast', { matchId: match.id, nomineeUserId })
        setMatch((prev: any) => ({
          ...prev,
          mvpVotes: upsertMvpVote(prev?.mvpVotes ?? [], user.id, nomineeUserId),
        }))
      }}
      onUploadReplay={async (file) => {
        const form = new FormData()
        form.append('replay', file)
        const { data } = await api.post(`/matches/${match.id}/replays`, form, {
          headers: { 'Content-Type': 'multipart/form-data' },
        })
        const upload = data.upload
        setMatch((prev: any) => ({
          ...prev,
          replayUploads: [
            upload,
            ...(prev?.replayUploads ?? []).filter((entry: any) => entry.id !== upload.id),
          ],
        }))
        return upload
      }}
      onCancelMatch={() => getSocket().emit('match:cancel_request', { matchId: match.id })}
      onBack={() => {
        window.sessionStorage.setItem(DISMISSED_ACTIVE_MATCH_KEY, match.id)
        navigate({ to: '/dashboard' })
      }}
    />

  )
}

function RoomShellCard({
  eyebrow,
  title,
  description,
  actionLabel,
  onAction,
}: {
  eyebrow: string
  title: string
  description: string
  actionLabel?: string
  onAction?: () => void
}) {
  return (
    <section
      style={{
        maxWidth: '960px',
        margin: '0 auto',
        border: '1px solid rgba(0,200,255,0.15)',
        background:
          "linear-gradient(180deg, rgba(17,25,39,0.86), rgba(8,12,20,0.82))",
        padding: '1.4rem',
        display: 'grid',
        gap: '0.9rem',
      }}
    >
      <div
        style={{
          color: '#7dd3fc',
          fontFamily: 'var(--font-display)',
          fontSize: '0.72rem',
          fontWeight: 900,
          letterSpacing: '0.22em',
          textTransform: 'uppercase',
        }}
      >
        {eyebrow}
      </div>
      <div
        style={{
          color: '#fff',
          fontFamily: 'var(--font-display)',
          fontSize: 'clamp(1.6rem, 4vw, 2.6rem)',
          fontWeight: 900,
          letterSpacing: '0.05em',
          textTransform: 'uppercase',
          lineHeight: 0.95,
        }}
      >
        {title}
      </div>
      <p
        style={{
          margin: 0,
          maxWidth: '680px',
          color: 'rgba(232,244,255,0.62)',
          fontSize: '0.95rem',
          lineHeight: 1.65,
        }}
      >
        {description}
      </p>
      {actionLabel && onAction && (
        <button
          type='button'
          onClick={onAction}
          style={{
            justifySelf: 'start',
            border: '1px solid rgba(125,211,252,0.38)',
            background: 'rgba(14,116,144,0.18)',
            color: '#bae6fd',
            padding: '0.8rem 1rem',
            fontFamily: 'var(--font-display)',
            fontWeight: 900,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            cursor: 'pointer',
          }}
        >
          {actionLabel}
        </button>
      )}
    </section>
  )
}
