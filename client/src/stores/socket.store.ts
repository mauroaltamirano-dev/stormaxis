import { create } from 'zustand'

export type SocketStatus = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'error'

interface SocketState {
  status: SocketStatus
  reconnectAttempts: number
  lastError: string | null
  lastConnectedAt: number | null
  setStatus: (status: SocketStatus) => void
  setConnected: () => void
  setReconnecting: (attempt?: number) => void
  setError: (message: string) => void
  reset: () => void
}

export const useSocketStore = create<SocketState>((set) => ({
  status: 'idle',
  reconnectAttempts: 0,
  lastError: null,
  lastConnectedAt: null,
  setStatus: (status) => set({ status }),
  setConnected: () => set({ status: 'connected', reconnectAttempts: 0, lastError: null, lastConnectedAt: Date.now() }),
  setReconnecting: (attempt) => set((state) => ({
    status: 'reconnecting',
    reconnectAttempts: attempt ?? Math.max(1, state.reconnectAttempts + 1),
  })),
  setError: (message) => set({ status: 'error', lastError: message.slice(0, 240) }),
  reset: () => set({ status: 'idle', reconnectAttempts: 0, lastError: null }),
}))

