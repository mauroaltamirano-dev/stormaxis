import { create } from 'zustand'

export type QueueStatus = 'idle' | 'searching' | 'found' | 'accepting'

interface PendingMatch {
  matchId: string
  expiresAt: number
  acceptedBy?: string[]
  acceptedCount?: number
  totalPlayers?: number
  teams: {
    team1: Array<{ id: string; username: string; avatar: string | null; rank: string }>
    team2: Array<{ id: string; username: string; avatar: string | null; rank: string }>
  }
}

interface MatchmakingState {
  status: QueueStatus
  searchStartedAt: number | null
  pendingMatch: PendingMatch | null
  activeMatchId: string | null
  queueSize: number
  queuePosition: number | null
  queueEtaSeconds: number | null

  startSearching: (startedAt?: number) => void
  stopSearching: () => void
  setMatchFound: (match: PendingMatch) => void
  setActiveMatch: (matchId: string | null) => void
  clearPendingMatch: () => void
  resetMatchmaking: () => void
  setQueueSize: (size: number) => void
  setQueueProgress: (payload: { position?: number | null; etaSeconds?: number | null }) => void
}

const STORAGE_KEY = 'nexusgg.matchmaking.queue_state.v1'

type PersistedQueueState = Pick<
  MatchmakingState,
  'status' | 'searchStartedAt' | 'queueSize' | 'queuePosition' | 'queueEtaSeconds'
>

function loadPersistedQueueState(): PersistedQueueState | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<PersistedQueueState>
    return {
      status: parsed.status === 'searching' ? 'searching' : 'idle',
      searchStartedAt: typeof parsed.searchStartedAt === 'number' ? parsed.searchStartedAt : null,
      queueSize: typeof parsed.queueSize === 'number' ? Math.max(0, Math.floor(parsed.queueSize)) : 0,
      queuePosition:
        typeof parsed.queuePosition === 'number'
          ? Math.max(1, Math.floor(parsed.queuePosition))
          : null,
      queueEtaSeconds:
        typeof parsed.queueEtaSeconds === 'number'
          ? Math.max(0, Math.floor(parsed.queueEtaSeconds))
          : null,
    }
  } catch {
    return null
  }
}

function persistQueueState(state: PersistedQueueState) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // noop
  }
}

const persisted = loadPersistedQueueState()

export const useMatchmakingStore = create<MatchmakingState>((set) => ({
  status: persisted?.status ?? 'idle',
  searchStartedAt: persisted?.searchStartedAt ?? null,
  pendingMatch: null,
  activeMatchId: null,
  queueSize: persisted?.queueSize ?? 0,
  queuePosition: persisted?.queuePosition ?? null,
  queueEtaSeconds: persisted?.queueEtaSeconds ?? null,

  startSearching: (startedAt) =>
    set((state) => {
      const nextStatus: QueueStatus = 'searching'
      const nextSearchStartedAt = startedAt ?? Date.now()
      persistQueueState({
        status: nextStatus,
        searchStartedAt: nextSearchStartedAt,
        queueSize: state.queueSize,
        queuePosition: state.queuePosition,
        queueEtaSeconds: state.queueEtaSeconds,
      })
      return { status: nextStatus, searchStartedAt: nextSearchStartedAt }
    }),
  stopSearching: () =>
    set((state) => {
      const nextStatus: QueueStatus = 'idle'
      persistQueueState({
        status: nextStatus,
        searchStartedAt: null,
        queueSize: state.queueSize,
        queuePosition: null,
        queueEtaSeconds: null,
      })
      return { status: nextStatus, searchStartedAt: null, queuePosition: null, queueEtaSeconds: null }
    }),

  setMatchFound: (match) => set({ status: 'found', pendingMatch: match, activeMatchId: match.matchId }),
  setActiveMatch: (activeMatchId) => set({ activeMatchId }),
  clearPendingMatch: () => set((state) => ({
    pendingMatch: null,
    status: state.activeMatchId ? state.status : 'idle',
  })),
  resetMatchmaking: () =>
    set((state) => {
      persistQueueState({
        status: 'idle',
        searchStartedAt: null,
        queueSize: state.queueSize,
        queuePosition: null,
        queueEtaSeconds: null,
      })
      return {
        status: 'idle',
        pendingMatch: null,
        activeMatchId: null,
        searchStartedAt: null,
        queuePosition: null,
        queueEtaSeconds: null,
      }
    }),

  setQueueSize: (size) =>
    set((state) => {
      const nextQueueSize = Math.max(0, Math.floor(size))
      persistQueueState({
        status: state.status,
        searchStartedAt: state.searchStartedAt,
        queueSize: nextQueueSize,
        queuePosition: state.queuePosition,
        queueEtaSeconds: state.queueEtaSeconds,
      })
      return { queueSize: nextQueueSize }
    }),
  setQueueProgress: ({ position, etaSeconds }) =>
    set((state) => {
      const queuePosition =
        typeof position === 'number'
          ? Math.max(1, Math.floor(position))
          : position === null
            ? null
            : state.queuePosition
      const queueEtaSeconds =
        typeof etaSeconds === 'number'
          ? Math.max(0, Math.floor(etaSeconds))
          : etaSeconds === null
            ? null
            : state.queueEtaSeconds

      persistQueueState({
        status: state.status,
        searchStartedAt: state.searchStartedAt,
        queueSize: state.queueSize,
        queuePosition,
        queueEtaSeconds,
      })

      return { queuePosition, queueEtaSeconds }
    }),
}))
