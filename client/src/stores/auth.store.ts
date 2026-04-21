import { create } from 'zustand'
import { initSocket, disconnectSocket, setSocketAuthToken } from '../lib/socket'
import { useMatchmakingStore } from './matchmaking.store'

interface AuthUser {
  id: string
  username: string
  email: string | null
  avatar: string | null
  role: string
  mmr: number
  rank: string
  displayLevel?: string
  level?: number
  levelProgressPct?: number
  nextLevelAt?: number | null
  winrate?: number
  wins: number
  losses: number
  mainRole?: 'RANGED' | 'HEALER' | 'OFFLANE' | 'FLEX' | 'TANK' | null
  secondaryRole?: 'RANGED' | 'HEALER' | 'OFFLANE' | 'FLEX' | 'TANK' | null
  discordId: string | null
  discordUsername: string | null
  bnetId: string | null
  bnetBattletag: string | null
  googleId: string | null
  createdAt?: string
  linkedAccounts?: Array<{
    provider: 'discord' | 'google' | 'bnet'
    providerUserId: string
    displayName: string | null
  }>
}

interface AuthState {
  user: AuthUser | null
  accessToken: string | null
  isLoading: boolean

  setAuth: (user: AuthUser, token: string) => void
  setAccessToken: (token: string) => void
  updateUser: (partial: Partial<AuthUser>) => void
  logout: () => void
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  accessToken: null,
  isLoading: true,

  setAuth: (user, token) => {
    set({ user, accessToken: token, isLoading: false })
    initSocket(token)
  },

  setAccessToken: (token) => {
    set({ accessToken: token })
    setSocketAuthToken(token)
  },

  updateUser: (partial) => {
    const current = get().user
    if (!current) return
    set({ user: { ...current, ...partial } })
  },

  logout: () => {
    disconnectSocket()
    useMatchmakingStore.getState().resetMatchmaking()
    set({ user: null, accessToken: null, isLoading: false })
  },
}))
