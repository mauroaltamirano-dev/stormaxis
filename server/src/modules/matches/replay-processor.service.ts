import { createHash, randomUUID } from 'crypto'
import { promises as fs } from 'fs'
import path from 'path'
import type { Prisma } from '@prisma/client'
import { db } from '../../infrastructure/database/client'
import { Errors } from '../../shared/errors/AppError'

// hots-parser no publica tipos TypeScript.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const Parser = require('hots-parser') as {
  processReplay: (file: string, options?: Record<string, unknown>) => ParsedReplayResult
  StatusString?: Record<number, string>
}

type ParsedReplayResult = {
  status: number
  match?: {
    map?: string
    mode?: number
    region?: number
    version?: { m_build?: number }
    length?: number
    date?: string | Date
    winner?: number
  }
  players?: Record<string, ParsedReplayPlayer>
}

type ParsedReplayPlayer = {
  name?: string
  hero?: string
  tag?: number
  ToonHandle?: string
  team?: number
  win?: boolean
  gameStats?: Record<string, number | string | boolean | null | undefined>
}

type ExpectedMatch = {
  id: string
  selectedMap: string | null
  players: Array<{
    userId: string | null
    isBot: boolean
    team: number
    isCaptain: boolean
    user: { username: string; bnetBattletag: string | null } | null
    botName: string | null
  }>
}

type StoredReplayUpload = {
  id: string
  matchId: string
  uploadedById: string | null
  uploadedByUsername: string | null
  status: string
  originalName: string
  storagePath: string
  fileSize: number
  sha256: string
  parsedMap: string | null
  parsedGameMode: string | null
  parsedRegion: number | null
  parsedBuild: number | null
  parsedDuration: number | null
  parsedGameDate: Date | null
  parsedWinnerTeam: number | null
  parserStatus: string | null
  parseError: string | null
  parsedSummary: Prisma.JsonValue | null
  createdAt: Date
  updatedAt: Date
}

export type ReplayUploadResult = {
  upload: ReturnType<typeof serializeReplayUpload>
  duplicate: boolean
}

const GAME_MODE_NAMES: Record<number, string> = {
  50021: 'Versus AI',
  50041: 'Practice',
  50001: 'Quick Match',
  50031: 'Brawl',
  50051: 'Unranked Draft',
  50061: 'Hero League',
  50071: 'Team League',
  50091: 'Storm League',
  [-1]: 'Custom',
}

export async function listMatchReplayUploads(matchId: string, take = 10) {
  const uploads = await db.$queryRaw<StoredReplayUpload[]>`
    SELECT r.*, u."username" AS "uploadedByUsername"
    FROM "MatchReplayUpload" r
    LEFT JOIN "User" u ON u."id" = r."uploadedById"
    WHERE r."matchId" = ${matchId}
    ORDER BY r."createdAt" DESC
    LIMIT ${take}
  `
  return uploads.map(serializeReplayUpload)
}

export async function ingestMatchReplay({
  match,
  uploadedById,
  originalName,
  filePath,
  fileSize,
}: {
  match: ExpectedMatch
  uploadedById: string
  originalName: string
  filePath: string
  fileSize: number
}): Promise<ReplayUploadResult> {
  const sha256 = await hashFile(filePath)
  const storagePath = path.relative(process.cwd(), filePath)

  const existing = await findReplayUploadBySha(sha256)
  if (existing) {
    await safeUnlink(filePath)
    if (existing.matchId !== match.id) {
      throw Errors.CONFLICT('Este replay ya fue subido para otro match.')
    }
    return { upload: serializeReplayUpload(existing), duplicate: true }
  }

  const parsed = parseReplay(filePath)
  const parserStatus = Parser.StatusString?.[parsed.status] ?? String(parsed.status)
  const parsedOk = parsed.status === 1 && parsed.match && parsed.players
  const summary = parsedOk ? buildReplaySummary(parsed, match) : null

  const upload = await createReplayUpload({
    id: randomUUID(),
    matchId: match.id,
    uploadedById,
    status: parsedOk ? 'PARSED' : 'FAILED',
    originalName,
    storagePath,
    fileSize,
    sha256,
    parsedMap: parsed.match?.map ?? null,
    parsedGameMode: toGameModeName(parsed.match?.mode),
    parsedRegion: asNumberOrNull(parsed.match?.region),
    parsedBuild: asNumberOrNull(parsed.match?.version?.m_build),
    parsedDuration: asNumberOrNull(parsed.match?.length),
    parsedGameDate: toDateOrNull(parsed.match?.date),
    parsedWinnerTeam: toStormAxisTeam(parsed.match?.winner),
    parserStatus,
    parseError: parsedOk ? null : `Parser status: ${parserStatus}`,
    parsedSummary: summary,
  })

  return { upload: serializeReplayUpload(upload), duplicate: false }
}

export function serializeReplayUpload(upload: StoredReplayUpload) {
  return {
    id: upload.id,
    matchId: upload.matchId,
    uploadedById: upload.uploadedById,
    uploadedBy: upload.uploadedById
      ? { id: upload.uploadedById, username: upload.uploadedByUsername ?? 'Usuario' }
      : null,
    status: upload.status,
    originalName: upload.originalName,
    fileSize: upload.fileSize,
    sha256: upload.sha256,
    parsedMap: upload.parsedMap,
    parsedGameMode: upload.parsedGameMode,
    parsedRegion: upload.parsedRegion,
    parsedBuild: upload.parsedBuild,
    parsedDuration: upload.parsedDuration,
    parsedGameDate: upload.parsedGameDate,
    parsedWinnerTeam: upload.parsedWinnerTeam,
    parserStatus: upload.parserStatus,
    parseError: upload.parseError,
    parsedSummary: upload.parsedSummary,
    createdAt: upload.createdAt,
  }
}

async function findReplayUploadBySha(sha256: string) {
  const rows = await db.$queryRaw<StoredReplayUpload[]>`
    SELECT r.*, u."username" AS "uploadedByUsername"
    FROM "MatchReplayUpload" r
    LEFT JOIN "User" u ON u."id" = r."uploadedById"
    WHERE r."sha256" = ${sha256}
    LIMIT 1
  `
  return rows[0] ?? null
}

async function createReplayUpload(input: {
  id: string
  matchId: string
  uploadedById: string
  status: 'PARSED' | 'FAILED'
  originalName: string
  storagePath: string
  fileSize: number
  sha256: string
  parsedMap: string | null
  parsedGameMode: string | null
  parsedRegion: number | null
  parsedBuild: number | null
  parsedDuration: number | null
  parsedGameDate: Date | null
  parsedWinnerTeam: 1 | 2 | null
  parserStatus: string
  parseError: string | null
  parsedSummary: unknown
}) {
  const rows = await db.$queryRaw<StoredReplayUpload[]>`
    INSERT INTO "MatchReplayUpload" (
      "id", "matchId", "uploadedById", "status", "originalName", "storagePath",
      "fileSize", "sha256", "parsedMap", "parsedGameMode", "parsedRegion",
      "parsedBuild", "parsedDuration", "parsedGameDate", "parsedWinnerTeam",
      "parserStatus", "parseError", "parsedSummary", "updatedAt"
    ) VALUES (
      ${input.id}, ${input.matchId}, ${input.uploadedById}, CAST(${input.status}::text AS "ReplayUploadStatus"),
      ${input.originalName}, ${input.storagePath}, ${input.fileSize}, ${input.sha256},
      ${input.parsedMap}, ${input.parsedGameMode}, ${input.parsedRegion}, ${input.parsedBuild},
      ${input.parsedDuration}, ${input.parsedGameDate}, ${input.parsedWinnerTeam},
      ${input.parserStatus}, ${input.parseError}, ${input.parsedSummary ? JSON.stringify(input.parsedSummary) : null}::jsonb,
      NOW()
    )
    RETURNING *, (SELECT "username" FROM "User" WHERE "id" = ${input.uploadedById}) AS "uploadedByUsername"
  `
  return rows[0]
}

function parseReplay(filePath: string): ParsedReplayResult {
  try {
    return Parser.processReplay(filePath, {
      getBMData: false,
      overrideVerifiedBuild: true,
    })
  } catch {
    return {
      status: -2,
      match: undefined,
      players: undefined,
    }
  }
}

function buildReplaySummary(parsed: ParsedReplayResult, expectedMatch: ExpectedMatch) {
  const replayPlayers = Object.entries(parsed.players ?? {}).map(([toonHandle, player]) => {
    const battleTag = typeof player.tag === 'number' && Number.isFinite(player.tag) && player.tag > 0
      ? `${player.name ?? 'Unknown'}#${player.tag}`
      : null
    const stats = player.gameStats ?? {}

    return {
      toonHandle: player.ToonHandle ?? toonHandle,
      name: player.name ?? 'Unknown',
      battleTag,
      hero: player.hero ?? null,
      team: toStormAxisTeam(player.team),
      won: Boolean(player.win),
      takedowns: asNumberOrNull(stats.Takedowns),
      kills: asNumberOrNull(stats.SoloKill),
      deaths: asNumberOrNull(stats.Deaths),
      assists: asNumberOrNull(stats.Assists),
      heroDamage: asNumberOrNull(stats.HeroDamage),
      siegeDamage: asNumberOrNull(stats.SiegeDamage),
      healing: asNumberOrNull(stats.Healing),
      experience: asNumberOrNull(stats.ExperienceContribution),
    }
  })

  const expectedHumans = expectedMatch.players.filter((player) => !player.isBot && player.user)
  const matchedPlayers = expectedHumans.filter((expected) => {
    const expectedBattleTag = normalizeIdentity(expected.user?.bnetBattletag)
    const expectedName = normalizeIdentity(expected.user?.username)
    return replayPlayers.some((player) => {
      const replayBattleTag = normalizeIdentity(player.battleTag)
      const replayName = normalizeIdentity(player.name)
      return (expectedBattleTag && replayBattleTag === expectedBattleTag) || replayName === expectedName
    })
  })

  return {
    validation: {
      mapMatches: normalizeMap(parsed.match?.map) === normalizeMap(expectedMatch.selectedMap),
      expectedMap: expectedMatch.selectedMap,
      replayMap: parsed.match?.map ?? null,
      expectedHumanPlayers: expectedHumans.length,
      matchedPlayers: matchedPlayers.length,
    },
    match: {
      map: parsed.match?.map ?? null,
      gameMode: toGameModeName(parsed.match?.mode),
      region: asNumberOrNull(parsed.match?.region),
      build: asNumberOrNull(parsed.match?.version?.m_build),
      duration: asNumberOrNull(parsed.match?.length),
      gameDate: toDateOrNull(parsed.match?.date)?.toISOString() ?? null,
      winnerTeam: toStormAxisTeam(parsed.match?.winner),
    },
    players: replayPlayers,
  }
}

async function hashFile(filePath: string) {
  const data = await fs.readFile(filePath)
  return createHash('sha256').update(data).digest('hex')
}

async function safeUnlink(filePath: string) {
  await fs.unlink(filePath).catch(() => {})
}

function toStormAxisTeam(value: unknown): 1 | 2 | null {
  if (value === 0) return 1
  if (value === 1) return 2
  return null
}

function toGameModeName(mode: unknown) {
  if (typeof mode !== 'number') return null
  return GAME_MODE_NAMES[mode] ?? `Mode ${mode}`
}

function asNumberOrNull(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function toDateOrNull(value: unknown) {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(String(value))
  return Number.isNaN(date.getTime()) ? null : date
}

function normalizeIdentity(value: string | null | undefined) {
  return value?.trim().toLowerCase() ?? ''
}

function normalizeMap(value: string | null | undefined) {
  return value?.trim().toLowerCase().replace(/[^a-z0-9]+/g, '') ?? ''
}
