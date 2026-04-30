import { Prisma } from '@prisma/client'
import { randomUUID } from 'crypto'
import { db } from '../../infrastructure/database/client'
import { Errors } from '../../shared/errors/AppError'
import { initializeMatchVeto } from '../matches/veto-runtime.service'
import { requireTeamManager } from '../teams/teams.service'
import { redis, REDIS_KEYS } from '../../infrastructure/redis/client'
import { getIO } from '../../infrastructure/socket/server'
import { calculateRank } from '../users/player-progression'

const SCRIM_TEAM_SIZE = 5
const SCRIM_VETO_TIMEOUT_MS = 30_000
const DEFAULT_SCRIM_MMR = 1200
const SELF_SERVE_ACCEPT_TIMEOUT_MS = 60_000

type ScrimSideInput = {
  captain1UserId: string
  captain2UserId: string
  team1PlayerIds: string[]
  team2PlayerIds: string[]
}

type ScrimPlayerSeed = {
  userId: string | null
  isBot: boolean
  botName: string | null
  team: 1 | 2
  isCaptain: boolean
  mmrBefore: number
}

type ScrimDetailsRecord = {
  id?: string
  matchId: string
  team1Name: string
  team2Name: string
  notes: string | null
  scheduledAt: Date | null
  createdById: string | null
  createdAt?: Date
  updatedAt?: Date
}

type ScrimUserRecord = {
  id: string
  username?: string | null
  mmr: number
  isBot?: boolean
}

type ActiveTeamMemberRecord = {
  userId: string
  user?: { isBot?: boolean | null } | null
}

function emitScrimEvent(event: 'scrims:search_updated' | 'scrims:challenge_updated', userIds: string[] = []) {
  try {
    const io = getIO()
    const uniqueUserIds = [...new Set(userIds.filter(Boolean))]
    const payload = { version: 1, timestamp: Date.now() }
    if (uniqueUserIds.length === 0) {
      io.emit(event, payload)
      return
    }
    for (const userId of uniqueUserIds) io.to(`user:${userId}`).emit(event, payload)
  } catch {
    // Socket server may be unavailable in tests.
  }
}

async function getTeamMemberUserIds(teamIds: string[]): Promise<string[]> {
  const uniqueTeamIds = [...new Set(teamIds.filter(Boolean))]
  if (uniqueTeamIds.length === 0) return []
  try {
    const members = await (db as any).teamMember.findMany({
      where: { teamId: { in: uniqueTeamIds }, status: 'ACTIVE' },
      select: { userId: true },
    }) as Array<{ userId: string }>
    return [...new Set(members.map((member: { userId: string }) => String(member.userId)))]
  } catch {
    return []
  }
}

export type CreateAdminScrimInput = ScrimSideInput & {
  actorId: string
  team1Name: string
  team2Name: string
  notes?: string | null
  scheduledAt?: string | Date | null
}

function prismaClientSupportsScrimDetails() {
  const matchModel = Prisma.dmmf.datamodel.models.find((model) => model.name === 'Match')
  return Boolean(matchModel?.fields.some((field) => field.name === 'scrimDetails'))
}

function prismaClientSupportsUserIsBot() {
  const userModel = Prisma.dmmf.datamodel.models.find((model) => model.name === 'User')
  return Boolean(userModel?.fields.some((field) => field.name === 'isBot'))
}

function userSelect<T extends Record<string, boolean>>(select: T) {
  return {
    ...select,
    ...(prismaClientSupportsUserIsBot() ? { isBot: true } : {}),
  }
}

function isMissingUserIsBotColumn(err: unknown) {
  const candidate = err as { code?: string; meta?: { code?: string; message?: string }; message?: string }
  return (
    candidate.code === 'P2022' ||
    candidate.code === 'P2010' ||
    candidate.meta?.code === '42703' ||
    candidate.meta?.message?.includes('isBot') ||
    candidate.message?.includes('column "isBot" does not exist') ||
    candidate.message?.includes('column User.isBot does not exist')
  )
}

async function getBotUserIdsRaw(userIds: string[]) {
  const ids = [...new Set(userIds.filter(Boolean))]
  if (ids.length === 0) return new Set<string>()
  try {
    const rows = await db.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT "id"
      FROM "User"
      WHERE "id" IN (${Prisma.join(ids)})
      AND "isBot" = true
    `)
    return new Set(rows.map((row) => row.id))
  } catch (err) {
    if (isMissingUserIsBotColumn(err)) return new Set<string>()
    throw err
  }
}

async function markBotUsersOnTeamMembers(members: Array<{ userId: string; user?: { isBot?: boolean } | null }>) {
  if (prismaClientSupportsUserIsBot()) return
  const botIds = await getBotUserIdsRaw(members.map((member) => member.userId))
  for (const member of members) {
    if (member.user) member.user.isBot = botIds.has(member.userId)
  }
}

function isMissingScrimDetailsRelation(err: unknown) {
  const candidate = err as { code?: string; meta?: { code?: string; message?: string }; message?: string }
  return (
    candidate.code === 'P2021' ||
    candidate.meta?.code === '42P01' ||
    candidate.meta?.message?.includes('relation "ScrimDetails" does not exist') ||
    candidate.message?.includes('relation "ScrimDetails" does not exist') ||
    candidate.message?.includes('relation "public.ScrimDetails" does not exist')
  )
}

export async function getScrimDetailsForMatchIds(matchIds: string[]) {
  const ids = [...new Set(matchIds.filter(Boolean))]
  if (ids.length === 0) return new Map<string, ScrimDetailsRecord>()

  try {
    const rows = await db.$queryRaw<ScrimDetailsRecord[]>(Prisma.sql`
      SELECT
        "id",
        "matchId",
        "team1Name",
        "team2Name",
        "notes",
        "scheduledAt",
        "createdById",
        "createdAt",
        "updatedAt"
      FROM "ScrimDetails"
      WHERE "matchId" IN (${Prisma.join(ids)})
    `)
    return new Map(rows.map((row) => [row.matchId, row]))
  } catch (err) {
    if (isMissingScrimDetailsRelation(err)) return new Map<string, ScrimDetailsRecord>()
    throw err
  }
}

export async function attachScrimDetailsToMatches<T extends { id: string }>(matches: T[]) {
  const detailsByMatchId = await getScrimDetailsForMatchIds(matches.map((match) => match.id))
  return matches.map((match) => ({
    ...match,
    scrimDetails: detailsByMatchId.get(match.id) ?? null,
  }))
}

export async function attachScrimDetailsToMatch<T extends { id: string }>(match: T) {
  const detailsByMatchId = await getScrimDetailsForMatchIds([match.id])
  return {
    ...match,
    scrimDetails: detailsByMatchId.get(match.id) ?? null,
  }
}

async function createScrimDetailsRaw(details: Omit<ScrimDetailsRecord, 'id' | 'createdAt' | 'updatedAt'>) {
  await db.$executeRaw(Prisma.sql`
    INSERT INTO "ScrimDetails" (
      "id",
      "matchId",
      "team1Name",
      "team2Name",
      "notes",
      "scheduledAt",
      "createdById"
    )
    VALUES (
      ${randomUUID()},
      ${details.matchId},
      ${details.team1Name},
      ${details.team2Name},
      ${details.notes},
      ${details.scheduledAt},
      ${details.createdById}
    )
  `)
}

function cleanName(value: string, field: string) {
  const trimmed = value.trim()
  if (trimmed.length < 2) throw Errors.VALIDATION(`${field} debe tener al menos 2 caracteres`)
  return trimmed.slice(0, 80)
}

function uniqueIds(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))]
}

function buildTeamPlayers(team: 1 | 2, captainUserId: string, playerIds: string[]) {
  const normalizedCaptain = captainUserId.trim()
  if (!normalizedCaptain) throw Errors.VALIDATION('Cada scrim necesita un capitán por equipo')

  const humanIds = uniqueIds([normalizedCaptain, ...playerIds])
  if (humanIds.length > SCRIM_TEAM_SIZE) {
    throw Errors.VALIDATION(`El Team ${team} no puede tener más de ${SCRIM_TEAM_SIZE} jugadores`)
  }

  const players: ScrimPlayerSeed[] = humanIds.map((userId) => ({
    userId,
    isBot: false,
    botName: null,
    team,
    isCaptain: userId === normalizedCaptain,
    mmrBefore: DEFAULT_SCRIM_MMR,
  }))

  while (players.length < SCRIM_TEAM_SIZE) {
    players.push({
      userId: null,
      isBot: true,
      botName: `Scrim Slot ${team}-${players.length + 1}`,
      team,
      isCaptain: false,
      mmrBefore: DEFAULT_SCRIM_MMR,
    })
  }

  return players
}

export function buildScrimMatchPlayers(input: ScrimSideInput) {
  const team1 = buildTeamPlayers(1, input.captain1UserId, input.team1PlayerIds)
  const team2 = buildTeamPlayers(2, input.captain2UserId, input.team2PlayerIds)
  const humans = [...team1, ...team2].filter((player) => player.userId).map((player) => player.userId as string)
  const duplicated = humans.find((userId, index) => humans.indexOf(userId) !== index)
  if (duplicated) throw Errors.VALIDATION(`El jugador ${duplicated} está repetido en el scrim`)
  return [...team1, ...team2]
}

export type CreateTeamScrimSearchInput = {
  teamId: string
  starterUserIds: string[]
  coachUserId?: string | null
  observerUserIds?: string[] | null
  notes?: string | null
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((entry): entry is string => typeof entry === 'string')
}

function normalizeRosterIds(values: Array<string | null | undefined>) {
  return uniqueIds(values.filter((value): value is string => Boolean(value)))
}

async function getActiveTeamMembers(teamId: string) {
  const members = await (db as any).teamMember.findMany({
    where: { teamId, status: 'ACTIVE' },
    select: {
      userId: true,
      ...(prismaClientSupportsUserIsBot() ? { user: { select: { isBot: true } } } : {}),
    },
  })
  const botIds = prismaClientSupportsUserIsBot()
    ? new Set<string>()
    : await getBotUserIdsRaw(members.map((member: ActiveTeamMemberRecord) => member.userId))
  return new Map<string, { isBot: boolean }>(
    members.map((member: ActiveTeamMemberRecord) => [
      member.userId,
      { isBot: Boolean(member.user?.isBot) || (!prismaClientSupportsUserIsBot() && botIds.has(member.userId)) },
    ]),
  )
}

function assertSelectedUsersBelongToTeam(selectedIds: string[], membersById: Map<string, { isBot: boolean }>) {
  const outsideTeam = selectedIds.filter((userId) => !membersById.has(userId))
  if (outsideTeam.length > 0) {
    throw Errors.VALIDATION(`Jugadores fuera del equipo: ${outsideTeam.join(', ')}`)
  }
}

function assertSelectedUsersAreOnline(selectedIds: string[], onlineUserIds: Set<string>, message: string) {
  const offline = selectedIds.filter((userId) => !onlineUserIds.has(userId))
  if (offline.length > 0) throw Errors.VALIDATION(message)
}

function assertAtLeastOneOnlineHumanStarter(starterUserIds: string[], usersById: Map<string, { isBot?: boolean }>, onlineUserIds: Set<string>, message: string) {
  const hasOnlineHuman = starterUserIds.some((userId) => !usersById.get(userId)?.isBot && onlineUserIds.has(userId))
  if (!hasOnlineHuman) throw Errors.VALIDATION(message)
}

function validateSearchRoster(input: CreateTeamScrimSearchInput, membersById: Map<string, { isBot: boolean }>, onlineUserIds: Set<string>) {
  const starterUserIds = normalizeRosterIds(input.starterUserIds)
  if (starterUserIds.length !== SCRIM_TEAM_SIZE) {
    throw Errors.VALIDATION(`La búsqueda necesita exactamente ${SCRIM_TEAM_SIZE} titulares`)
  }

  const coachUserId = input.coachUserId?.trim() || null
  const observerUserIds = normalizeRosterIds(input.observerUserIds ?? [])
  if (observerUserIds.length > 2) throw Errors.VALIDATION('La búsqueda permite hasta 2 observers/suplentes')

  const extras = normalizeRosterIds([coachUserId, ...observerUserIds])
  const overlap = extras.find((userId) => starterUserIds.includes(userId))
  if (overlap) throw Errors.VALIDATION('Coach/observers no pueden ser titulares en la misma búsqueda')

  assertSelectedUsersBelongToTeam([...starterUserIds, ...extras], membersById)
  const botExtras = extras.filter((userId) => membersById.get(userId)?.isBot)
  if (botExtras.length > 0) throw Errors.VALIDATION('Coach/observers deben ser jugadores reales')
  const humanStarterIds = starterUserIds.filter((userId) => !membersById.get(userId)?.isBot)
  assertSelectedUsersAreOnline(humanStarterIds, onlineUserIds, 'La búsqueda necesita online starters: cada titular real debe estar online')
  assertAtLeastOneOnlineHumanStarter(starterUserIds, membersById, onlineUserIds, 'La búsqueda necesita online starters: al menos 1 titular real online')
  assertSelectedUsersAreOnline(extras, onlineUserIds, 'Coach/observers seleccionados deben estar online')

  return { starterUserIds, coachUserId, observerUserIds }
}

export async function createTeamScrimSearch(
  actorId: string,
  input: CreateTeamScrimSearchInput,
  onlineUserIds: Set<string>,
) {
  await requireTeamManager(actorId, input.teamId)

  const existingOpen = await (db as any).scrimSearch.findFirst({
    where: { teamId: input.teamId, status: 'OPEN' },
    select: { id: true },
  })
  if (existingOpen) throw Errors.CONFLICT('Team already has an open scrim search')

  const membersById = await getActiveTeamMembers(input.teamId)
  const roster = validateSearchRoster(input, membersById, onlineUserIds)

  const search = await (db as any).scrimSearch.create({
    data: {
      teamId: input.teamId,
      createdById: actorId,
      status: 'OPEN',
      starterUserIds: roster.starterUserIds,
      coachUserId: roster.coachUserId,
      observerUserIds: roster.observerUserIds,
      notes: input.notes?.trim() ? input.notes.trim().slice(0, 500) : null,
    },
    include: {
      team: true,
    },
  })
  const audience = await getTeamMemberUserIds([input.teamId])
  emitScrimEvent('scrims:search_updated', [...audience, actorId])
  return search
}

export async function createTeamScrimChallenge(actorId: string, fromSearchId: string, toSearchId: string) {
  const fromSearch = await (db as any).scrimSearch.findFirst({
    where: { id: fromSearchId, status: 'OPEN' },
    include: { team: true },
  })
  const toSearch = await (db as any).scrimSearch.findFirst({
    where: { id: toSearchId, status: 'OPEN' },
    include: { team: true },
  })
  if (!fromSearch || !toSearch) throw Errors.NOT_FOUND('Scrim search')
  if (fromSearch.teamId === toSearch.teamId) throw Errors.VALIDATION('No puedes desafiar a tu propio equipo')

  await requireTeamManager(actorId, fromSearch.teamId)

  const challenge = await (db as any).scrimChallenge.create({
    data: {
      fromSearchId,
      toSearchId,
      fromTeamId: fromSearch.teamId,
      toTeamId: toSearch.teamId,
      status: 'PENDING',
    },
    include: { fromTeam: true, toTeam: true, fromSearch: true, toSearch: true },
  })
  const audience = await getTeamMemberUserIds([fromSearch.teamId, toSearch.teamId])
  emitScrimEvent('scrims:challenge_updated', [...audience, actorId])
  return challenge
}

function buildSelfServeMatchPlayers(
  team: 1 | 2,
  starterUserIds: string[],
  userById: Map<string, ScrimUserRecord>,
) {
  return starterUserIds.map((userId, index) => {
    const user = userById.get(userId)
    const isBot = Boolean(user?.isBot)
    return {
      userId,
      isBot,
      botName: isBot ? (user?.username ?? `Scrim Bot ${team}-${index + 1}`) : null,
      team,
      isCaptain: index === 0,
      accepted: isBot ? true : null,
      mmrBefore: user?.mmr ?? DEFAULT_SCRIM_MMR,
    }
  })
}

function buildScrimAccessRows(matchId: string, team: 1 | 2, search: any) {
  const rows: Array<{ matchId: string; userId: string; team: 1 | 2; role: 'COACH' | 'OBSERVER' }> = []
  if (search.coachUserId) rows.push({ matchId, userId: search.coachUserId, team, role: 'COACH' })
  for (const userId of asStringArray(search.observerUserIds)) {
    rows.push({ matchId, userId, team, role: 'OBSERVER' })
  }
  return rows
}

async function emitSelfServeMatchFound(match: any, expiresAt: number) {
  try {
    const io = getIO()
    const players = match.players.filter((entry: any) => !entry.isBot && entry.userId)
    const payloadBase = {
      matchId: match.id,
      expiresAt,
      acceptedCount: 0,
      totalPlayers: players.length,
      acceptedBy: [],
      teams: {
        team1: match.players.filter((p: any) => p.team === 1).map((p: any) => ({
          id: p.userId ?? p.id,
          username: p.user?.username ?? p.botName ?? p.userId ?? 'Player',
          avatar: p.user?.avatar ?? null,
          rank: calculateRank(p.mmrBefore),
          mmr: p.mmrBefore,
          isBot: Boolean(p.isBot),
        })),
        team2: match.players.filter((p: any) => p.team === 2).map((p: any) => ({
          id: p.userId ?? p.id,
          username: p.user?.username ?? p.botName ?? p.userId ?? 'Player',
          avatar: p.user?.avatar ?? null,
          rank: calculateRank(p.mmrBefore),
          mmr: p.mmrBefore,
          isBot: Boolean(p.isBot),
        })),
      },
    }
    for (const player of players) io.to(`user:${player.userId}`).emit('matchmaking:found', payloadBase)
  } catch {
    // Socket server may be unavailable in tests or scripts. Match state remains persisted.
  }
}

export async function acceptTeamScrimChallenge(actorId: string, challengeId: string, onlineUserIds: Set<string>) {
  const challenge = await (db as any).scrimChallenge.findFirst({
    where: { id: challengeId, status: 'PENDING' },
    include: { fromTeam: true, toTeam: true, fromSearch: true, toSearch: true },
  })
  if (!challenge) throw Errors.NOT_FOUND('Scrim challenge')

  await requireTeamManager(actorId, challenge.toTeamId)

  const team1StarterIds = asStringArray(challenge.fromSearch.starterUserIds)
  const team2StarterIds = asStringArray(challenge.toSearch.starterUserIds)
  if (team1StarterIds.length !== SCRIM_TEAM_SIZE || team2StarterIds.length !== SCRIM_TEAM_SIZE) {
    throw Errors.VALIDATION('Cada equipo necesita 5 titulares para crear la partida')
  }
  const users = await (db.user as any).findMany({
    where: { id: { in: [...team1StarterIds, ...team2StarterIds] } },
    select: userSelect({ id: true, username: true, mmr: true }),
  })
  if (!prismaClientSupportsUserIsBot()) {
    const botIds = await getBotUserIdsRaw(users.map((user: ScrimUserRecord) => user.id))
    for (const user of users as ScrimUserRecord[]) user.isBot = Boolean(user.isBot) || botIds.has(user.id)
  }
  const userById = new Map<string, ScrimUserRecord>(users.map((user: ScrimUserRecord) => [user.id, user]))
  const missingUsers = [...team1StarterIds, ...team2StarterIds].filter((userId) => !userById.has(userId))
  if (missingUsers.length > 0) throw Errors.VALIDATION(`Jugadores no encontrados para scrim: ${missingUsers.join(', ')}`)
  const realStarterIds = [...team1StarterIds, ...team2StarterIds].filter((userId) => !userById.get(userId)?.isBot)
  assertSelectedUsersAreOnline(realStarterIds, onlineUserIds, 'Los titulares reales deben estar online para aceptar el scrim')
  assertAtLeastOneOnlineHumanStarter(team1StarterIds, userById, onlineUserIds, 'Team A necesita al menos 1 titular real online')
  assertAtLeastOneOnlineHumanStarter(team2StarterIds, userById, onlineUserIds, 'Team B necesita al menos 1 titular real online')

  const result = await (db as any).$transaction(async (tx: any) => {
    const match = await tx.match.create({
      data: {
        status: 'ACCEPTING',
        mode: 'TEAM',
        origin: 'SCRIM_SELF_SERVE',
        region: 'SA',
        scrimDetails: {
          create: {
            team1Name: challenge.fromTeam.name,
            team2Name: challenge.toTeam.name,
            team1Id: challenge.fromTeamId,
            team2Id: challenge.toTeamId,
            challengeId: challenge.id,
            notes: challenge.fromSearch.notes ?? challenge.toSearch.notes ?? null,
            scheduledAt: null,
            createdById: actorId,
          },
        },
        players: {
          create: [
            ...buildSelfServeMatchPlayers(1, team1StarterIds, userById),
            ...buildSelfServeMatchPlayers(2, team2StarterIds, userById),
          ],
        },
      },
      include: {
        scrimDetails: true,
        players: { include: { user: { select: { id: true, username: true, avatar: true, mmr: true } } } },
      },
    })

    const accessRows = [
      ...buildScrimAccessRows(match.id, 1, challenge.fromSearch),
      ...buildScrimAccessRows(match.id, 2, challenge.toSearch),
    ]
    if (accessRows.length > 0) {
      await tx.scrimAccess.createMany({ data: accessRows, skipDuplicates: true })
    }

    await tx.scrimSearch.updateMany({
      where: { id: { in: [challenge.fromSearchId, challenge.toSearchId] } },
      data: { status: 'MATCHED' },
    })
    await tx.scrimChallenge.update({
      where: { id: challenge.id },
      data: { status: 'ACCEPTED', matchId: match.id, respondedAt: new Date() },
    })

    return { match, accessRows }
  })

  const expiresAt = Date.now() + SELF_SERVE_ACCEPT_TIMEOUT_MS
  await redis.setex(
    REDIS_KEYS.pendingMatch(result.match.id),
    Math.ceil(SELF_SERVE_ACCEPT_TIMEOUT_MS / 1000),
    JSON.stringify({
      acceptedBy: [],
      declinedBy: [],
      expiresAt,
      totalPlayers: result.match.players.filter((player: any) => !player.isBot).length,
    }),
  )
  await emitSelfServeMatchFound(result.match, expiresAt)
  const audience = await getTeamMemberUserIds([challenge.fromTeamId, challenge.toTeamId])
  emitScrimEvent('scrims:search_updated', [...audience, actorId])
  emitScrimEvent('scrims:challenge_updated', [...audience, actorId])

  return { matchId: result.match.id, match: result.match, accessRows: result.accessRows }
}

export async function declineTeamScrimChallenge(actorId: string, challengeId: string) {
  const challenge = await (db as any).scrimChallenge.findFirst({ where: { id: challengeId, status: 'PENDING' } })
  if (!challenge) throw Errors.NOT_FOUND('Scrim challenge')
  await requireTeamManager(actorId, challenge.toTeamId)
  const updatedChallenge = await (db as any).scrimChallenge.update({
    where: { id: challengeId },
    data: { status: 'DECLINED', respondedAt: new Date() },
  })
  const audience = await getTeamMemberUserIds([challenge.fromTeamId, challenge.toTeamId])
  emitScrimEvent('scrims:challenge_updated', [...audience, actorId])
  return updatedChallenge
}

export async function getScrimAccessForUser(matchId: string, userId: string) {
  return (db as any).scrimAccess.findFirst({
    where: { matchId, userId },
    include: { user: { select: { id: true, username: true, avatar: true, discordId: true } } },
  })
}

export async function listScrimAccessForMatch(matchId: string) {
  return (db as any).scrimAccess.findMany({
    where: { matchId },
    include: { user: { select: { id: true, username: true, avatar: true, mmr: true } } },
    orderBy: [{ team: 'asc' }, { role: 'asc' }],
  })
}

export async function createAdminScrim(input: CreateAdminScrimInput) {
  const players = buildScrimMatchPlayers(input)
  const humanIds = players.filter((player) => player.userId).map((player) => player.userId as string)
  const users = await db.user.findMany({
    where: { id: { in: humanIds } },
    select: { id: true, mmr: true },
  })
  const userById = new Map(users.map((user) => [user.id, user]))
  const missing = humanIds.filter((userId) => !userById.has(userId))
  if (missing.length > 0) {
    throw Errors.VALIDATION(`Jugadores no encontrados para scrim: ${missing.join(', ')}`)
  }

  const team1Name = cleanName(input.team1Name, 'Team A')
  const team2Name = cleanName(input.team2Name, 'Team B')
  const scheduledAt = input.scheduledAt ? new Date(input.scheduledAt) : null
  if (scheduledAt && Number.isNaN(scheduledAt.getTime())) {
    throw Errors.VALIDATION('La fecha programada del scrim no es válida')
  }

  const scrimDetails = {
    team1Name,
    team2Name,
    notes: input.notes?.trim() ? input.notes.trim().slice(0, 500) : null,
    scheduledAt,
    createdById: input.actorId,
  }
  const supportsScrimRelation = prismaClientSupportsScrimDetails()

  const match = await (db.match as any).create({
    data: {
      status: 'VETOING',
      mode: 'TEAM',
      origin: 'SCRIM_ADMIN',
      region: 'SA',
      ...(supportsScrimRelation ? { scrimDetails: { create: scrimDetails } } : {}),
      players: {
        create: players.map((player) => ({
          userId: player.userId,
          isBot: player.isBot,
          botName: player.botName,
          team: player.team,
          isCaptain: player.isCaptain,
          accepted: player.isBot ? true : null,
          mmrBefore: player.userId ? (userById.get(player.userId)?.mmr ?? DEFAULT_SCRIM_MMR) : DEFAULT_SCRIM_MMR,
        })),
      },
    },
    include: {
      ...(supportsScrimRelation ? { scrimDetails: true } : {}),
      players: { include: { user: { select: { id: true, username: true, avatar: true, mmr: true } } } },
    },
  })

  if (!supportsScrimRelation) {
    await createScrimDetailsRaw({ matchId: match.id, ...scrimDetails })
    match.scrimDetails = { matchId: match.id, ...scrimDetails }
  }

  await initializeMatchVeto(match.id, { timeoutMs: SCRIM_VETO_TIMEOUT_MS, emit: false })
  return match
}

export async function listAdminScrims(limit = 30) {
  const supportsScrimRelation = prismaClientSupportsScrimDetails()
  const matches = await (db.match as any).findMany({
    where: supportsScrimRelation ? { mode: 'TEAM', scrimDetails: { isNot: null } } : { mode: 'TEAM' },
    include: {
      ...(supportsScrimRelation ? { scrimDetails: true } : {}),
      players: {
        include: { user: { select: { id: true, username: true, avatar: true, mmr: true } } },
        orderBy: [{ team: 'asc' }, { isCaptain: 'desc' }, { mmrBefore: 'desc' }],
      },
    },
    orderBy: { createdAt: 'desc' },
    take: Math.max(1, Math.min(100, limit)),
  })

  if (supportsScrimRelation) return matches
  const withDetails = await attachScrimDetailsToMatches(matches)
  return withDetails.filter((match) => match.scrimDetails)
}

export async function listSelfServeScrimsForUser(userId: string) {
  const myMembership = await (db as any).teamMember.findFirst({
    where: { userId, status: 'ACTIVE' },
    include: {
      team: {
        include: {
          members: {
            where: { status: 'ACTIVE' },
            include: { user: { select: userSelect({ id: true, username: true, avatar: true, mmr: true, rank: true }) } },
          },
          invites: {
            where: { status: 'PENDING' },
            include: { invitedUser: { select: { id: true, username: true, avatar: true } } },
            orderBy: { createdAt: 'desc' },
          },
        },
      },
    },
  })
  const myTeamId = myMembership?.teamId ?? null

  const [searches, incomingChallenges, outgoingChallenges, myInvites] = await Promise.all([
    (db as any).scrimSearch.findMany({
      where: { status: 'OPEN' },
      include: { team: { include: { members: { where: { status: 'ACTIVE' }, include: { user: { select: userSelect({ id: true, username: true, avatar: true, mmr: true, rank: true }) } } } } } },
      orderBy: { createdAt: 'desc' },
      take: 50,
    }),
    myTeamId
      ? (db as any).scrimChallenge.findMany({
          where: { toTeamId: myTeamId, status: 'PENDING' },
          include: { fromTeam: true, toTeam: true, fromSearch: true, toSearch: true },
          orderBy: { createdAt: 'desc' },
        })
      : Promise.resolve([]),
    myTeamId
      ? (db as any).scrimChallenge.findMany({
          where: { fromTeamId: myTeamId, status: 'PENDING' },
          include: { fromTeam: true, toTeam: true, fromSearch: true, toSearch: true },
          orderBy: { createdAt: 'desc' },
        })
      : Promise.resolve([]),
    (db as any).teamInvite.findMany({
      where: { invitedUserId: userId, status: 'PENDING' },
      include: { team: true, invitedBy: { select: { id: true, username: true, avatar: true } } },
      orderBy: { createdAt: 'desc' },
    }),
  ])

  if (myMembership?.team?.members) await markBotUsersOnTeamMembers(myMembership.team.members)
  for (const search of searches) {
    if (search.team?.members) await markBotUsersOnTeamMembers(search.team.members)
  }

  return {
    myTeam: myMembership?.team ?? null,
    myRole: myMembership?.role ?? null,
    myInvites,
    searches,
    incomingChallenges,
    outgoingChallenges,
  }
}
