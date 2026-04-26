import { createHash, randomUUID } from 'crypto'
import { promises as fs } from 'fs'
import type { Prisma } from '@prisma/client'
import { db } from '../../infrastructure/database/client'
import { Errors } from '../../shared/errors/AppError'
import { storeReplayFile } from './replay-storage.service'

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

type ReplaySummary = {
  validation?: Record<string, unknown>
  match?: Record<string, unknown>
  players?: Array<Record<string, unknown>>
  resolution?: Record<string, unknown>
  identityMatches?: Array<Record<string, unknown>>
  warnings?: string[]
}

type ReplayIdentityMatch = {
  userId: string | null
  expectedUsername: string
  expectedBattleTag: string | null
  replayName: string | null
  replayBattleTag: string | null
  expectedTeam: number
  replayTeam: 1 | 2 | null
  method: 'battletag' | 'username' | 'loose_name' | 'unmatched'
  confidence: 'high' | 'medium' | 'low' | 'none'
  issues: string[]
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
  const storedFile = await storeReplayFile({
    filePath,
    matchId: match.id,
    sha256,
    originalName,
    contentType: 'application/octet-stream',
  })

  const upload = await createReplayUpload({
    id: randomUUID(),
    matchId: match.id,
    uploadedById,
    status: parsedOk ? 'PARSED' : 'FAILED',
    originalName,
    storagePath: storedFile.storagePath,
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

  if (storedFile.removeLocalAfterStore) {
    await safeUnlink(filePath)
  }

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

export async function persistReplayUploadSummary(uploadId: string, parsedSummary: ReplaySummary | null) {
  await db.$executeRaw`
    UPDATE "MatchReplayUpload"
    SET "parsedSummary" = ${parsedSummary ? JSON.stringify(parsedSummary) : null}::jsonb,
        "updatedAt" = NOW()
    WHERE "id" = ${uploadId}
  `
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
      structureDamage: asNumberOrNull(stats.StructureDamage),
      minionDamage: asNumberOrNull(stats.MinionDamage),
      healing: asNumberOrNull(stats.Healing),
      selfHealing: asNumberOrNull(stats.SelfHealing),
      damageTaken: asNumberOrNull(stats.DamageTaken),
      protection: asNumberOrNull(stats.ProtectionGivenToAllies),
      experience: asNumberOrNull(stats.ExperienceContribution),
      mercCampCaptures: asNumberOrNull(stats.MercCampCaptures),
      timeSpentDead: asNumberOrNull(stats.TimeSpentDead),
      ccTime: asNumberOrNull(stats.TimeCCdEnemyHeroes),
      stunTime: asNumberOrNull(stats.TimeStunningEnemyHeroes),
      rootTime: asNumberOrNull(stats.TimeRootingEnemyHeroes),
      silenceTime: asNumberOrNull(stats.TimeSilencingEnemyHeroes),
      teamfightHeroDamage: asNumberOrNull(stats.TeamfightHeroDamage),
      teamfightHealing: asNumberOrNull(stats.TeamfightHealingDone),
      teamfightDamageTaken: asNumberOrNull(stats.TeamfightDamageTaken),
      gameScore: asNumberOrNull(stats.GameScore),
      highestKillStreak: asNumberOrNull(stats.HighestKillStreak),
      talents: normalizeReplayTalents((player as { talents?: unknown }).talents),
      awards: extractReplayAwards(stats),
    }
  })

  const expectedHumans = expectedMatch.players.filter((player) => !player.isBot && player.user)
  const identityMatches = matchExpectedPlayersToReplay(expectedHumans, replayPlayers)
  const matchedPlayers = identityMatches.filter((entry) => entry.method !== 'unmatched')
  const battleTagLinkedPlayers = expectedHumans.filter((entry) => entry.user?.bnetBattletag).length
  const battleTagMatchedPlayers = matchedPlayers.filter((entry) => entry.method === 'battletag').length
  const usernameMatchedPlayers = matchedPlayers.filter((entry) => entry.method === 'username' || entry.method === 'loose_name').length
  const missingBattleTagPlayers = matchedPlayers.filter((entry) => !entry.expectedBattleTag && entry.replayBattleTag).length
  const battleTagMismatches = identityMatches.filter((entry) => entry.issues.includes('battletag_mismatch')).length
  const teamMismatches = identityMatches.filter((entry) => entry.issues.includes('team_mismatch')).length
  const mapMatches = normalizeMap(parsed.match?.map) === normalizeMap(expectedMatch.selectedMap)
  const trustScore = calculateReplayTrustScore({
    expectedHumanPlayers: expectedHumans.length,
    matchedPlayers: matchedPlayers.length,
    battleTagMatchedPlayers,
    mapMatches,
    battleTagMismatches,
    teamMismatches,
    missingBattleTagPlayers,
  })
  const identityConfidence = trustScore >= 75 ? 'high' : trustScore >= 55 ? 'medium' : 'low'
  const warnings = buildReplayWarnings({
    mapMatches,
    expectedHumanPlayers: expectedHumans.length,
    matchedPlayers: matchedPlayers.length,
    battleTagLinkedPlayers,
    battleTagMatchedPlayers,
    usernameMatchedPlayers,
    missingBattleTagPlayers,
    battleTagMismatches,
    teamMismatches,
  })

  return {
    validation: {
      mapMatches,
      expectedMap: expectedMatch.selectedMap,
      replayMap: parsed.match?.map ?? null,
      expectedHumanPlayers: expectedHumans.length,
      matchedPlayers: matchedPlayers.length,
      minimumMatchedPlayers: expectedHumans.length > 0 ? Math.max(4, Math.ceil(expectedHumans.length * 0.6)) : 0,
      winnerDetected: toStormAxisTeam(parsed.match?.winner),
      battleTagLinkedPlayers,
      battleTagMatchedPlayers,
      usernameMatchedPlayers,
      missingBattleTagPlayers,
      battleTagMismatches,
      teamMismatches,
      identityConfidence,
      trustScore,
      issues: warnings,
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
    identityMatches,
    warnings,
  }
}

function matchExpectedPlayersToReplay(
  expectedHumans: ExpectedMatch['players'],
  replayPlayers: Array<{
    name: string
    battleTag: string | null
    team: 1 | 2 | null
  }>,
): ReplayIdentityMatch[] {
  const usedReplayIndexes = new Set<number>()

  return expectedHumans.map((expected) => {
    const expectedBattleTag = normalizeIdentity(expected.user?.bnetBattletag)
    const expectedUsername = expected.user?.username ?? 'Usuario'
    const expectedName = normalizeIdentity(expectedUsername)
    const expectedLooseName = normalizePlayerName(expectedUsername)

    let bestIndex = -1
    let method: ReplayIdentityMatch['method'] = 'unmatched'
    let confidence: ReplayIdentityMatch['confidence'] = 'none'

    if (expectedBattleTag) {
      bestIndex = replayPlayers.findIndex((player, index) => {
        return !usedReplayIndexes.has(index) && normalizeIdentity(player.battleTag) === expectedBattleTag
      })
      if (bestIndex >= 0) {
        method = 'battletag'
        confidence = 'high'
      }
    }

    if (bestIndex < 0) {
      bestIndex = replayPlayers.findIndex((player, index) => {
        return !usedReplayIndexes.has(index) && normalizeIdentity(player.name) === expectedName
      })
      if (bestIndex >= 0) {
        method = 'username'
        confidence = expectedBattleTag ? 'low' : 'medium'
      }
    }

    if (bestIndex < 0 && expectedLooseName) {
      bestIndex = replayPlayers.findIndex((player, index) => {
        return !usedReplayIndexes.has(index) && normalizePlayerName(player.name) === expectedLooseName
      })
      if (bestIndex >= 0) {
        method = 'loose_name'
        confidence = 'low'
      }
    }

    const replay = bestIndex >= 0 ? replayPlayers[bestIndex] : null
    if (bestIndex >= 0) usedReplayIndexes.add(bestIndex)

    const issues: string[] = []
    const replayBattleTag = replay?.battleTag ?? null
    const normalizedReplayBattleTag = normalizeIdentity(replayBattleTag)
    if (!expectedBattleTag) issues.push('missing_expected_battletag')
    if (
      expectedBattleTag &&
      normalizedReplayBattleTag &&
      normalizedReplayBattleTag !== expectedBattleTag
    ) {
      issues.push('battletag_mismatch')
    }
    if (replay?.team && replay.team !== expected.team) issues.push('team_mismatch')
    if (!replay) issues.push('not_found_in_replay')

    return {
      userId: expected.userId,
      expectedUsername,
      expectedBattleTag: expected.user?.bnetBattletag ?? null,
      replayName: replay?.name ?? null,
      replayBattleTag,
      expectedTeam: expected.team,
      replayTeam: replay?.team ?? null,
      method,
      confidence,
      issues,
    }
  })
}

function calculateReplayTrustScore(input: {
  expectedHumanPlayers: number
  matchedPlayers: number
  battleTagMatchedPlayers: number
  mapMatches: boolean
  battleTagMismatches: number
  teamMismatches: number
  missingBattleTagPlayers: number
}) {
  const expected = Math.max(1, input.expectedHumanPlayers)
  const matchCoverage = input.matchedPlayers / expected
  const battleTagCoverage = input.battleTagMatchedPlayers / expected
  const score =
    matchCoverage * 45 +
    battleTagCoverage * 35 +
    (input.mapMatches ? 10 : 0) +
    (input.teamMismatches === 0 ? 10 : 0) -
    input.battleTagMismatches * 25 -
    input.teamMismatches * 15 -
    input.missingBattleTagPlayers * 3

  return Math.max(0, Math.min(100, Math.round(score)))
}

function buildReplayWarnings(input: {
  mapMatches: boolean
  expectedHumanPlayers: number
  matchedPlayers: number
  battleTagLinkedPlayers: number
  battleTagMatchedPlayers: number
  usernameMatchedPlayers: number
  missingBattleTagPlayers: number
  battleTagMismatches: number
  teamMismatches: number
}) {
  const warnings: string[] = []
  if (!input.mapMatches) warnings.push('map_mismatch')
  if (input.matchedPlayers < Math.max(4, Math.ceil(input.expectedHumanPlayers * 0.6))) {
    warnings.push('low_player_match_coverage')
  }
  if (input.battleTagLinkedPlayers === 0) warnings.push('no_linked_battletags')
  if (input.battleTagMatchedPlayers === 0 && input.usernameMatchedPlayers > 0) {
    warnings.push('username_only_identity')
  }
  if (input.missingBattleTagPlayers > 0) warnings.push('matched_users_missing_battletag')
  if (input.battleTagMismatches > 0) warnings.push('battletag_mismatch')
  if (input.teamMismatches > 0) warnings.push('team_mismatch')
  return warnings
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

function normalizeReplayTalents(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return []
  return Object.entries(value as Record<string, unknown>)
    .map(([tier, talent]) => ({
      tier,
      name: typeof talent === 'string' ? talent : String(talent ?? ''),
    }))
    .filter((entry) => entry.name.trim().length > 0)
    .sort((a, b) => talentTierOrder(a.tier) - talentTierOrder(b.tier))
}

function talentTierOrder(tier: string) {
  const match = tier.match(/(\d+)/)
  return match ? Number(match[1]) : 99
}

function extractReplayAwards(stats: Record<string, unknown>) {
  return Object.entries(stats)
    .filter(([key, value]) => key.startsWith('EndOfMatchAward') && value === 1)
    .map(([key]) => key.replace(/^EndOfMatchAward/, '').replace(/Boolean$/, ''))
}

function toDateOrNull(value: unknown) {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(String(value))
  return Number.isNaN(date.getTime()) ? null : date
}

function normalizeIdentity(value: string | null | undefined) {
  return value?.trim().toLowerCase() ?? ''
}

function normalizePlayerName(value: string | null | undefined) {
  return normalizeIdentity(value).replace(/#[0-9]+$/, '').replace(/[^a-z0-9]+/g, '')
}

function normalizeMap(value: string | null | undefined) {
  return value?.trim().toLowerCase().replace(/[^a-z0-9]+/g, '') ?? ''
}
