import { io, Socket } from 'socket.io-client'
import { useSocketStore } from '../stores/socket.store'
import { reportClientError } from './monitoring'

let socket: Socket | null = null
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || undefined

export function getSocket(): Socket {
  if (!socket) {
    throw new Error('Socket not initialized. Call initSocket(token) first.')
  }
  return socket
}

export function initSocket(accessToken: string): Socket {
  const socketState = useSocketStore.getState()

  if (socket) {
    socket.auth = { token: accessToken }
    if (!socket.connected) {
      socketState.setStatus('connecting')
      socket.connect()
    }
    return socket
  }

  socketState.setStatus('connecting')

  socket = io(SOCKET_URL ?? '/', {
    auth: { token: accessToken },
    path: '/socket.io',
    autoConnect: true,
    transports: ['websocket', 'polling'],
    reconnectionAttempts: 5,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    randomizationFactor: 0.5,
    timeout: 10000,
  })

  socket.on('connect', () => {
    console.log('Socket connected:', socket?.id)
    useSocketStore.getState().setConnected()
  })

  socket.on('disconnect', (reason) => {
    if (reason === 'io client disconnect') {
      useSocketStore.getState().setStatus('idle')
      return
    }
    useSocketStore.getState().setReconnecting()
  })

  socket.on('connect_error', (err) => {
    reportClientError(err, 'socket.connect_error')
    useSocketStore.getState().setError(err.message || 'Socket connection failed')
  })

  socket.io.on('reconnect_attempt', (attempt) => {
    useSocketStore.getState().setReconnecting(attempt)
  })

  socket.io.on('reconnect_failed', () => {
    reportClientError('Socket reconnect failed', 'socket.reconnect_failed')
    useSocketStore.getState().setError('No pude reconectar el realtime')
  })

  socket.io.on('reconnect_error', (err: Error) => {
    reportClientError(err, 'socket.reconnect_error')
    useSocketStore.getState().setError(err.message || 'Reconnection error')
  })

  return socket
}

export function setSocketAuthToken(accessToken: string) {
  if (!socket) return
  socket.auth = { token: accessToken }
}

export function disconnectSocket() {
  socket?.disconnect()
  socket = null
  useSocketStore.getState().reset()
}
