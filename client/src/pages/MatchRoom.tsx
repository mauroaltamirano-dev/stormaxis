import { useEffect, useState } from 'react'
import { useNavigate, useParams } from '@tanstack/react-router'
import { ActiveMatchRoom } from '../components/matchmaking/ActiveMatchRoom'
import { api } from '../lib/api'
import { getSocket } from '../lib/socket'
import { useAuthStore } from '../stores/auth.store'

const DISMISSED_ACTIVE_MATCH_KEY = 'nexusgg.dismissedActiveMatchId'

function upsertVote(votes: Array<{ userId: string; winner: 1 | 2 }>, userId: string, winner: 1 | 2) {
  const next = votes.filter((vote) => vote.userId !== userId)
  next.push({ userId, winner })
  return next
}

type MatchChatMessage = {
  id: string
  userId: string
  username: string
  avatar: string | null
  content: string
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

  return {
    id,
    userId,
    username,
    avatar: avatar ?? null,
    content,
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
  const [match, setMatch] = useState<any | null>(null)
  const [chatMessages, setChatMessages] = useState<MatchChatMessage[]>([])

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
        },
      }))
    }
    const onVoteUpdate = (payload: any) => {
      syncMatch((prev) => ({
        ...prev,
        runtime: {
          ...(prev.runtime ?? {}),
          voteCounts: payload,
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
        },
      }))
    }
    const onMatchComplete = (payload: any) => {
      syncMatch((prev) => ({
        ...prev,
        status: 'COMPLETED',
        winner: payload.winner,
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
    socket.on('match:complete', onMatchComplete)
    socket.on('match:cancel:update', onCancelUpdate)
    socket.on('match:cancelled', onCancelled)
    socket.on('matchmaking:cancelled', onCancelled)
    socket.on('chat:message', onChatMessage)

    api.get(`/matches/${matchId}`)
      .then(({ data }) => setMatch(data))
      .catch(() => navigate({ to: '/dashboard' }))

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
      socket.off('match:complete', onMatchComplete)
      socket.off('match:cancel:update', onCancelUpdate)
      socket.off('match:cancelled', onCancelled)
      socket.off('matchmaking:cancelled', onCancelled)
      socket.off('chat:message', onChatMessage)
      socket.off('connect', joinMatchRoom)
    }
  }, [matchId, navigate, user])

  if (!user || !match) return null

  return (
    <ActiveMatchRoom
      currentUserId={user.id}
      match={match}
      chatMessages={chatMessages}
      onSendMessage={(content) => {
        getSocket().emit('chat:send', { matchId: match.id, content })
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
      onCancelMatch={() => getSocket().emit('match:cancel_request', { matchId: match.id })}
      onBack={() => {
        window.sessionStorage.setItem(DISMISSED_ACTIVE_MATCH_KEY, match.id)
        navigate({ to: '/dashboard' })
      }}
    />

  )
}
