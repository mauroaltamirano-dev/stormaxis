import { Router } from 'express'
import { z } from 'zod'
import multer from 'multer'
import path from 'path'
import fs from 'fs'
import { authenticate, AuthRequest } from '../../shared/middlewares/authenticate'
import { db } from '../../infrastructure/database/client'
import { applyReplayWinnerResolution, castMvpVote, castVote, markPlayerReady, getRealtimeMatchMeta } from './matches.service'
import { Errors } from '../../shared/errors/AppError'
import { calculateRank } from '../users/player-progression'
import { getDiscordVoiceAccessForUser } from './discord-match-voice.service'
import { ingestMatchReplay, listMatchReplayUploads, persistReplayUploadSummary } from './replay-processor.service'
import { getReplayUploadTempDir } from './replay-storage.service'

export const matchesRouter = Router()

matchesRouter.use(authenticate)

const replayUploadDir = getReplayUploadTempDir()
fs.mkdirSync(replayUploadDir, { recursive: true })

const replayUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, replayUploadDir),
    filename: (_req, file, cb) => {
      const safeBase = path
        .basename(file.originalname)
        .replace(/[^a-zA-Z0-9._-]+/g, '-')
        .slice(0, 120)
      cb(null, `${Date.now()}-${Math.random().toString(16).slice(2)}-${safeBase}`)
    },
  }),
  limits: {
    files: 1,
    fileSize: Number(process.env.REPLAY_UPLOAD_MAX_BYTES || 50 * 1024 * 1024),
  },
  fileFilter: (_req, file, cb) => {
    if (!file.originalname.toLowerCase().endsWith('.stormreplay')) {
      return cb(Errors.VALIDATION('El archivo debe ser un .StormReplay.'))
    }
    cb(null, true)
  },
})

matchesRouter.get('/live', async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthRequest
    const matches = await db.match.findMany({
      where: { status: { in: ['VETOING', 'PLAYING', 'VOTING'] } },
      include: {
        players: {
          orderBy: [{ team: 'asc' }, { isCaptain: 'desc' }, { mmrBefore: 'desc' }],
          include: {
            user: {
              select: {
                id: true,
                username: true,
                avatar: true,
                mmr: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 12,
    })

    const enriched = await Promise.all(
      matches.map(async (match) => {
        const runtime = await getRealtimeMatchMeta(match.id)
        const humanPlayers = match.players.filter((player) => !player.isBot)
        const readyCount = runtime.ready?.readyBy.length ?? 0
        const viewerPlayer = match.players.find((player) => player.userId === authReq.userId)

        return {
          id: match.id,
          status: match.status,
          mode: match.mode,
          region: match.region,
          selectedMap: match.selectedMap,
          createdAt: match.createdAt,
          startedAt: match.startedAt,
          viewerTeam: viewerPlayer?.team ?? null,
          readyCount,
          totalPlayers: runtime.ready?.totalPlayers ?? humanPlayers.length,
          voteCounts: runtime.voteCounts,
          teams: {
            1: match.players
              .filter((player) => player.team === 1)
              .map((player) => ({
                userId: player.userId,
                username: player.user?.username ?? player.botName ?? 'TestBot',
                avatar: player.user?.avatar ?? null,
                mmr: player.user?.mmr ?? player.mmrBefore,
                isCaptain: player.isCaptain,
                isBot: player.isBot,
              })),
            2: match.players
              .filter((player) => player.team === 2)
              .map((player) => ({
                userId: player.userId,
                username: player.user?.username ?? player.botName ?? 'TestBot',
                avatar: player.user?.avatar ?? null,
                mmr: player.user?.mmr ?? player.mmrBefore,
                isCaptain: player.isCaptain,
                isBot: player.isBot,
              })),
          },
        }
      }),
    )

    res.json(enriched)
  } catch (err) {
    next(err)
  }
})

matchesRouter.get('/:matchId', async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthRequest
    const match = await db.match.findUnique({
      where: { id: req.params.matchId },
      include: {
        players: {
          include: {
            user: {
              select: {
                id: true,
                username: true,
                avatar: true,
                rank: true,
                mmr: true,
                wins: true,
                losses: true,
                countryCode: true,
                matchPlayers: {
                  where: { match: { status: 'COMPLETED' } },
                  select: {
                    team: true,
                    match: { select: { winner: true, selectedMap: true, createdAt: true } },
                  },
                  orderBy: { match: { createdAt: 'desc' } },
                  take: 5,
                },
              },
            },
          },
        },
        vetoes: { orderBy: { order: 'asc' } },
        votes: { select: { userId: true, winner: true } },
      },
    })
    if (!match) throw Errors.NOT_FOUND('Match')
    const [runtime, mvpVotes, mvpRecord, discordVoice] = await Promise.all([
      getRealtimeMatchMeta(req.params.matchId),
      db.$queryRaw<Array<{ userId: string; nomineeUserId: string }>>`
        SELECT "userId", "nomineeUserId" FROM "MvpVote" WHERE "matchId" = ${req.params.matchId}
      `,
      db.$queryRaw<Array<{ mvpUserId: string | null }>>`
        SELECT "mvpUserId" FROM "Match" WHERE "id" = ${req.params.matchId}
      `,
      getDiscordVoiceAccessForUser(req.params.matchId, authReq.userId),
    ])
    res.json({
      ...match,
      mvpUserId: mvpRecord[0]?.mvpUserId ?? null,
      mvpVotes,
      discordVoice,
      runtime,
      replayUploads: await listMatchReplayUploads(req.params.matchId, 3),
      players: match.players.map((player) => ({
        ...player,
        user: player.user
          ? {
              ...player.user,
              rank: calculateRank(player.user.mmr),
              winrate: player.user.wins + player.user.losses > 0
                ? Math.round((player.user.wins / (player.user.wins + player.user.losses)) * 100)
                : 0,
              recentMatches: (player.user.matchPlayers ?? []).map((mp) => ({
                won: mp.match.winner === mp.team,
                map: mp.match.selectedMap ?? null,
                date: mp.match.createdAt,
              })),
              matchPlayers: undefined, // no exponer la relación raw
            }
          : {
              id: player.userId ?? `bot:${player.id}`,
              username: player.botName ?? 'TestBot',
              avatar: null,
              mmr: player.mmrBefore,
              rank: calculateRank(player.mmrBefore),
              wins: 0,
              losses: 0,
              countryCode: null,
              winrate: 0,
              recentMatches: [],
            },
      })),
    })
  } catch (err) {
    next(err)
  }
})

matchesRouter.get('/:matchId/replays', async (req, res, next) => {
  try {
    res.json(await listMatchReplayUploads(req.params.matchId, 10))
  } catch (err) {
    next(err)
  }
})

matchesRouter.post('/:matchId/replays', replayUpload.single('replay'), async (req, res, next) => {
  const uploadedFile = req.file
  try {
    const authReq = req as unknown as AuthRequest
    if (!uploadedFile) throw Errors.VALIDATION('Subí un archivo .StormReplay.')

    const match = await db.match.findUnique({
      where: { id: String(req.params.matchId) },
      select: {
        id: true,
        status: true,
        selectedMap: true,
        players: {
          select: {
            userId: true,
            isBot: true,
            team: true,
            isCaptain: true,
            botName: true,
            user: { select: { username: true, bnetBattletag: true } },
          },
        },
      },
    })
    if (!match) throw Errors.NOT_FOUND('Match')

    const viewerPlayer = match.players.find((player) => player.userId === authReq.userId)
    const canUpload = authReq.userRole === 'ADMIN' || Boolean(viewerPlayer?.isCaptain)
    if (!canUpload) throw Errors.FORBIDDEN()

    if (!['VOTING', 'COMPLETED'].includes(match.status)) {
      throw Errors.VALIDATION('El replay se puede subir cuando la partida ya terminó y está en votación o completada.')
    }

    const result = await ingestMatchReplay({
      match,
      uploadedById: authReq.userId,
      originalName: uploadedFile.originalname,
      filePath: uploadedFile.path,
      fileSize: uploadedFile.size,
    })

    const normalizedSummary =
      result.upload.parsedSummary && typeof result.upload.parsedSummary === 'object' && !Array.isArray(result.upload.parsedSummary)
        ? result.upload.parsedSummary
        : null

    const replayDecision = await applyReplayWinnerResolution(match.id, {
      status: result.upload.status,
      parsedWinnerTeam:
        result.upload.parsedWinnerTeam === 1 || result.upload.parsedWinnerTeam === 2
          ? result.upload.parsedWinnerTeam
          : null,
      parsedSummary: normalizedSummary as {
        validation?: {
          mapMatches?: boolean
          expectedHumanPlayers?: number
          matchedPlayers?: number
          minimumMatchedPlayers?: number
          battleTagLinkedPlayers?: number
          battleTagMatchedPlayers?: number
          usernameMatchedPlayers?: number
          missingBattleTagPlayers?: number
          battleTagMismatches?: number
          teamMismatches?: number
          identityConfidence?: 'high' | 'medium' | 'low'
          trustScore?: number
          issues?: string[]
        }
      } | null,
    })
    if (normalizedSummary) {
      const nextSummary = {
        ...normalizedSummary,
        resolution: replayDecision,
      }
      await persistReplayUploadSummary(result.upload.id, nextSummary)
      result.upload = {
        ...result.upload,
        parsedSummary: nextSummary,
      }
    }

    res.status(result.duplicate ? 200 : 201).json({
      ...result,
      replayDecision,
    })
  } catch (err) {
    if (uploadedFile?.path) fs.promises.unlink(uploadedFile.path).catch(() => {})
    next(err)
  }
})

matchesRouter.post('/:matchId/ready', async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthRequest
    await markPlayerReady(req.params.matchId, authReq.userId)
    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})

matchesRouter.post('/:matchId/vote', async (req, res, next) => {
  try {
    const { winner } = z.object({ winner: z.union([z.literal(1), z.literal(2)]) }).parse(req.body)
    const authReq = req as unknown as AuthRequest
    await castVote(req.params.matchId, authReq.userId, winner)
    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})

matchesRouter.post('/:matchId/mvp-vote', async (req, res, next) => {
  try {
    const { nomineeUserId } = z.object({ nomineeUserId: z.string().min(1) }).parse(req.body)
    const authReq = req as unknown as AuthRequest
    await castMvpVote(req.params.matchId, authReq.userId, nomineeUserId)
    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})

matchesRouter.get('/:matchId/chat', async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthRequest
    const viewerPlayer = await db.matchPlayer.findUnique({
      where: { matchId_userId: { matchId: req.params.matchId, userId: authReq.userId } },
      select: { team: true, isBot: true },
    })
    const viewerTeam = viewerPlayer?.isBot ? null : viewerPlayer?.team ?? null

    const messages = await db.$queryRaw<
      Array<{
        id: string
        userId: string
        username: string
        avatar: string | null
        content: string
        channel: string
        team: number | null
        createdAt: Date
      }>
    >`
      SELECT cm."id", cm."userId", u."username", u."avatar", cm."content",
             COALESCE(cm."channel", 'GLOBAL') AS "channel", cm."team", cm."createdAt"
      FROM "ChatMessage" cm
      JOIN "User" u ON u."id" = cm."userId"
      WHERE cm."matchId" = ${req.params.matchId}
        AND (cm."channel" = 'GLOBAL' OR (cm."channel" = 'TEAM' AND cm."team" = ${viewerTeam}))
      ORDER BY cm."createdAt" ASC
    `

    res.json(
      messages.map((message) => ({
        id: message.id,
        userId: message.userId,
        username: message.username,
        avatar: message.avatar,
        content: message.content,
        channel: message.channel === 'TEAM' ? 'TEAM' : 'GLOBAL',
        team: message.team === 1 || message.team === 2 ? message.team : null,
        timestamp: message.createdAt,
        createdAt: message.createdAt,
      })),
    )
  } catch (err) {
    next(err)
  }
})
