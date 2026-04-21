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

export const useMatchmakingStore = create<MatchmakingState>((set) => ({
  status: 'idle',
  searchStartedAt: null,
  pendingMatch: null,
  activeMatchId: null,
  queueSize: 0,
  queuePosition: null,
  queueEtaSeconds: null,

  startSearching: (startedAt) => set({ status: 'searching', searchStartedAt: startedAt ?? Date.now() }),
  stopSearching: () => set({ status: 'idle', searchStartedAt: null, queuePosition: null, queueEtaSeconds: null }),

  setMatchFound: (match) => set({ status: 'found', pendingMatch: match, activeMatchId: match.matchId }),
  setActiveMatch: (activeMatchId) => set({ activeMatchId }),
  clearPendingMatch: () => set((state) => ({
    pendingMatch: null,
    status: state.activeMatchId ? state.status : 'idle',
  })),
  resetMatchmaking: () => set({
    status: 'idle',
    pendingMatch: null,
    activeMatchId: null,
    searchStartedAt: null,
    queuePosition: null,
    queueEtaSeconds: null,
  }),

  setQueueSize: (size) => set({ queueSize: size }),
  setQueueProgress: ({ position, etaSeconds }) => set((state) => ({
    queuePosition:
      typeof position === 'number'
        ? Math.max(1, Math.floor(position))
        : position === null
          ? null
          : state.queuePosition,
    queueEtaSeconds:
      typeof etaSeconds === 'number'
        ? Math.max(0, Math.floor(etaSeconds))
        : etaSeconds === null
          ? null
          : state.queueEtaSeconds,
  })),
}))
