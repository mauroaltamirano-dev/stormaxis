import { Server, Socket } from 'socket.io'
import { acceptMatch, declineMatch } from './matchmaking.service'

export function registerMatchmakingHandlers(io: Server, socket: Socket) {
  const userId = socket.data.userId as string

  socket.on('match:accept', async (
    { matchId }: { matchId: string },
    ack?: (payload: { ok: boolean; matchId?: string; message?: string }) => void,
  ) => {
    try {
      await acceptMatch(matchId, userId)
      ack?.({ ok: true, matchId })
      socket.emit('match:accept:ok', { matchId })
    } catch (err) {
      const message = (err as Error).message
      ack?.({ ok: false, message })
      socket.emit('error', { code: 'ACCEPT_FAILED', message })
    }
  })

  socket.on('match:decline', async ({ matchId }: { matchId: string }) => {
    try {
      await declineMatch(matchId, userId)
      socket.emit('match:decline:ok', { matchId })
    } catch (err) {
      socket.emit('error', { code: 'DECLINE_FAILED', message: (err as Error).message })
    }
  })
}
