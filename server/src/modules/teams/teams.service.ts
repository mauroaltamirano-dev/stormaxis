import { Prisma } from '@prisma/client'
import { db } from '../../infrastructure/database/client'
import { Errors } from '../../shared/errors/AppError'
import { calculateRank } from '../users/player-progression'
import { getIO } from '../../infrastructure/socket/server'

export type TeamRole = 'OWNER' | 'CAPTAIN' | 'MEMBER'
export type TeamCompetitiveRole = 'UNASSIGNED' | 'CAPTAIN' | 'STARTER' | 'SUBSTITUTE' | 'COACH' | 'STAFF'
export type TeamInviteResponse = 'ACCEPT' | 'DECLINE'
export type TeamJoinRequestResponse = 'ACCEPT' | 'DECLINE'

export type CreateTeamInput = {
  name: string
  logoUrl?: string | null
  bannerUrl?: string | null
  description?: string | null
  availabilityDays?: string[] | null
}

export type CreateTeamInviteInput = {
  teamId: string
  invitedUserId: string
}

export type CreateTeamJoinRequestInput = {
  teamId: string
}

export type UpdateTeamProfileInput = {
  name?: string
  logoUrl?: string | null
  bannerUrl?: string | null
  description?: string | null
  availabilityDays?: string[] | null
}

export type AddTestBotsToTeamInput = {
  targetSize?: number
}

const TEAM_NAME_MAX_LENGTH = 80
const TEAM_PROFILE_TEXT_MAX_LENGTH = 500
const TEAM_AVAILABILITY_DAY_MAX = 14
const TEAM_MAX_STARTERS = 5
const TEAM_MAX_CAPTAINS = 1

function teamDb() {
  return db as any
}

function emitTeamEvent(event: 'teams:updated' | 'teams:invite_updated' | 'teams:join_request_updated', userIds: string[] = []) {
  try {
    const io = getIO()
    const uniqueUserIds = [...new Set(userIds.filter(Boolean))]
    const payload = { version: 1, timestamp: Date.now() }
    if (uniqueUserIds.length === 0) {
      io.emit(event, payload)
      return
    }
    for (const userId of uniqueUserIds) {
      io.to(`user:${userId}`).emit(event, payload)
    }
  } catch {
    // Socket server may be unavailable in tests.
  }
}

async function getTeamAudienceUserIds(teamId: string) {
  try {
    const [members, invites, joinRequests] = await Promise.all([
      teamDb().teamMember.findMany({
        where: { teamId, status: 'ACTIVE' },
        select: { userId: true },
      }),
      teamDb().teamInvite.findMany({
        where: { teamId, status: 'PENDING' },
        select: { invitedUserId: true },
      }),
      teamDb().teamJoinRequest.findMany({
        where: { teamId, status: 'PENDING' },
        select: { userId: true },
      }),
    ])
    return [...new Set([
      ...members.map((entry: { userId: string }) => entry.userId),
      ...invites.map((entry: { invitedUserId: string }) => entry.invitedUserId),
      ...joinRequests.map((entry: { userId: string }) => entry.userId),
    ])]
  } catch {
    return []
  }
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

async function markBotUserRaw(executor: { $executeRaw: typeof db.$executeRaw }, userId: string) {
  try {
    await executor.$executeRaw(Prisma.sql`UPDATE "User" SET "isBot" = true WHERE "id" = ${userId}`)
  } catch (err) {
    const candidate = err as { code?: string; meta?: { code?: string; message?: string }; message?: string }
    const missingColumn =
      candidate.code === 'P2010' ||
      candidate.code === 'P2022' ||
      candidate.meta?.code === '42703' ||
      candidate.meta?.message?.includes('isBot') ||
      candidate.message?.includes('column "isBot"')
    if (!missingColumn) throw err
    // The bot flag migration may not be applied yet in a local smoke DB.
    // The user still exists; callers can rerun migrations before bot-aware smoke tests.
  }
}

export function slugifyTeamName(name: string) {
  const slug = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
  return slug || `team-${Date.now()}`
}

function cleanTeamName(name: string) {
  const trimmed = name.trim()
  if (trimmed.length < 2) throw Errors.VALIDATION('El nombre del equipo debe tener al menos 2 caracteres')
  return trimmed.slice(0, TEAM_NAME_MAX_LENGTH)
}

function cleanNullableUrl(value?: string | null) {
  const trimmed = value?.trim() ?? ''
  return trimmed.length > 0 ? trimmed.slice(0, TEAM_PROFILE_TEXT_MAX_LENGTH) : null
}

function cleanDescription(value?: string | null) {
  const trimmed = value?.trim() ?? ''
  return trimmed.length > 0 ? trimmed.slice(0, TEAM_PROFILE_TEXT_MAX_LENGTH) : null
}

function cleanAvailabilityDays(value?: string[] | null) {
  if (!Array.isArray(value)) return null
  const cleaned = uniqueIds(
    value
      .filter((day): day is string => typeof day === 'string')
      .map((day) => day.trim().toUpperCase())
      .filter(Boolean),
  ).slice(0, TEAM_AVAILABILITY_DAY_MAX)
  return cleaned.length > 0 ? cleaned : null
}

export function canManageTeamRole(role?: string | null) {
  return role === 'OWNER' || role === 'CAPTAIN'
}

async function findActiveMembership(userId: string) {
  return teamDb().teamMember.findFirst({
    where: { userId, status: 'ACTIVE' },
    include: { team: true },
  })
}

export async function requireTeamManager(userId: string, teamId: string) {
  const membership = await teamDb().teamMember.findFirst({
    where: { userId, teamId, status: 'ACTIVE' },
  })
  if (!canManageTeamRole(membership?.role)) throw Errors.FORBIDDEN()
  return membership
}

export async function createTeam(actorId: string, input: CreateTeamInput) {
  const existing = await findActiveMembership(actorId)
  if (existing) throw Errors.CONFLICT('User already belongs to an active team')

  const name = cleanTeamName(input.name)
  const team = await teamDb().team.create({
    data: {
      name,
      slug: slugifyTeamName(name),
      logoUrl: cleanNullableUrl(input.logoUrl),
      bannerUrl: cleanNullableUrl(input.bannerUrl),
      description: cleanDescription(input.description),
      availabilityDays: cleanAvailabilityDays(input.availabilityDays),
      ownerId: actorId,
      members: {
        create: { userId: actorId, role: 'OWNER', status: 'ACTIVE' },
      },
    },
    include: {
      members: { include: { user: { select: userSelect({ id: true, username: true, avatar: true, mmr: true }) } } },
    },
  })
  emitTeamEvent('teams:updated', [actorId])
  return team
}

export async function getMyTeam(userId: string) {
  const membership = await teamDb().teamMember.findFirst({
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
            include: { invitedUser: { select: userSelect({ id: true, username: true, avatar: true }) } },
            orderBy: { createdAt: 'desc' },
          },
          joinRequests: {
            where: { status: 'PENDING' },
            include: {
              user: { select: userSelect({ id: true, username: true, avatar: true, mmr: true, rank: true }) },
            },
            orderBy: { createdAt: 'desc' },
          },
        },
      },
    },
  })
  return membership?.team ?? null
}

export async function createTeamInvite(actorId: string, input: CreateTeamInviteInput) {
  await requireTeamManager(actorId, input.teamId)

  const existing = await findActiveMembership(input.invitedUserId)
  if (existing) throw Errors.CONFLICT('Invited user already belongs to an active team')

  const pendingInvite = await teamDb().teamInvite.findFirst({
    where: { teamId: input.teamId, invitedUserId: input.invitedUserId, status: 'PENDING' },
  })
  if (pendingInvite) throw Errors.CONFLICT('Ya existe una invitación pendiente para este jugador')

  try {
    const invite = await teamDb().teamInvite.create({
      data: {
        teamId: input.teamId,
        invitedUserId: input.invitedUserId,
        invitedById: actorId,
        status: 'PENDING',
      },
    })
    const audience = await getTeamAudienceUserIds(input.teamId)
    emitTeamEvent('teams:invite_updated', [...audience, actorId, input.invitedUserId])
    return invite
  } catch (error: any) {
    if (error?.code === 'P2002') throw Errors.CONFLICT('Ya existe una invitación pendiente para este jugador')
    throw error
  }
}

export async function listMyTeamInvites(userId: string) {
  return teamDb().teamInvite.findMany({
    where: { invitedUserId: userId, status: 'PENDING' },
    include: { team: true, invitedBy: { select: { id: true, username: true, avatar: true } } },
    orderBy: { createdAt: 'desc' },
  })
}

export async function respondToTeamInvite(userId: string, inviteId: string, response: TeamInviteResponse) {
  const invite = await teamDb().teamInvite.findFirst({
    where: { id: inviteId, invitedUserId: userId, status: 'PENDING' },
  })
  if (!invite) throw Errors.NOT_FOUND('Team invite')

  if (response === 'DECLINE') {
    const result = await teamDb().teamInvite.update({ where: { id: inviteId }, data: { status: 'DECLINED', respondedAt: new Date() } })
    const audience = await getTeamAudienceUserIds(invite.teamId)
    emitTeamEvent('teams:invite_updated', [...audience, userId])
    return result
  }

  const existing = await findActiveMembership(userId)
  if (existing) throw Errors.CONFLICT('User already belongs to an active team')

  const accepted = await teamDb().$transaction(async (tx: any) => {
    await tx.teamMember.create({
      data: { teamId: invite.teamId, userId, role: 'MEMBER', status: 'ACTIVE' },
    })
    const acceptedInvite = await tx.teamInvite.update({
      where: { id: inviteId },
      data: { status: 'ACCEPTED', respondedAt: new Date() },
    })
    await tx.teamInvite.updateMany({
      where: {
        invitedUserId: userId,
        status: 'PENDING',
        NOT: { id: inviteId },
      },
      data: { status: 'EXPIRED', respondedAt: new Date() },
    })
    await tx.teamJoinRequest?.updateMany?.({
      where: {
        userId,
        status: 'PENDING',
      },
      data: { status: 'EXPIRED', respondedAt: new Date() },
    })
    return acceptedInvite
  })
  const audience = await getTeamAudienceUserIds(invite.teamId)
  emitTeamEvent('teams:updated', [...audience, userId])
  emitTeamEvent('teams:invite_updated', [...audience, userId])
  emitTeamEvent('teams:join_request_updated', [...audience, userId])
  return accepted
}

export async function listTeamDirectory() {
  return teamDb().team.findMany({
    where: { status: 'ACTIVE' },
    select: {
      id: true,
      name: true,
      slug: true,
      logoUrl: true,
      bannerUrl: true,
      description: true,
      availabilityDays: true,
      ownerId: true,
      members: {
        where: { status: 'ACTIVE' },
        select: {
          userId: true,
          role: true,
          competitiveRole: true,
          user: { select: userSelect({ id: true, username: true, avatar: true, mmr: true, rank: true }) },
        },
      },
    },
    orderBy: [{ createdAt: 'desc' }],
    take: 60,
  })
}

export async function listMyTeamJoinRequests(userId: string) {
  return teamDb().teamJoinRequest.findMany({
    where: { userId, status: 'PENDING' },
    include: {
      team: {
        select: { id: true, name: true, slug: true, logoUrl: true },
      },
    },
    orderBy: { createdAt: 'desc' },
  })
}

export async function listIncomingTeamJoinRequests(userId: string) {
  const membership = await teamDb().teamMember.findFirst({
    where: { userId, status: 'ACTIVE' },
  })
  if (!membership || !canManageTeamRole(membership.role)) return []
  return teamDb().teamJoinRequest.findMany({
    where: {
      teamId: membership.teamId,
      status: 'PENDING',
    },
    include: {
      user: { select: userSelect({ id: true, username: true, avatar: true, mmr: true, rank: true }) },
      team: { select: { id: true, name: true, slug: true, logoUrl: true } },
    },
    orderBy: { createdAt: 'desc' },
  })
}

export async function getTeamsHub(userId: string) {
  const [myTeam, myInvites, sentJoinRequests, teamDirectory] = await Promise.all([
    getMyTeam(userId),
    listMyTeamInvites(userId),
    listMyTeamJoinRequests(userId),
    listTeamDirectory(),
  ])
  const membership = myTeam?.members?.find((member: any) => member.userId === userId) ?? null
  const incomingJoinRequests = membership && canManageTeamRole(membership.role)
    ? await listIncomingTeamJoinRequests(userId)
    : []
  return {
    myTeam,
    myRole: membership?.role ?? null,
    myInvites,
    sentJoinRequests,
    incomingJoinRequests,
    teamDirectory,
  }
}

export async function createTeamJoinRequest(actorId: string, input: CreateTeamJoinRequestInput) {
  const existingMembership = await findActiveMembership(actorId)
  if (existingMembership) throw Errors.CONFLICT('Ya perteneces a un equipo activo')

  const team = await teamDb().team.findFirst({ where: { id: input.teamId, status: 'ACTIVE' }, select: { id: true } })
  if (!team) throw Errors.NOT_FOUND('Team')

  const existingInvite = await teamDb().teamInvite.findFirst({
    where: { teamId: input.teamId, invitedUserId: actorId, status: 'PENDING' },
    select: { id: true },
  })
  if (existingInvite) throw Errors.CONFLICT('Ya tienes una invitación pendiente de este equipo')

  const pending = await teamDb().teamJoinRequest.findFirst({
    where: { teamId: input.teamId, userId: actorId, status: 'PENDING' },
  })
  if (pending) throw Errors.CONFLICT('Ya existe una solicitud pendiente para este equipo')

  try {
    const request = await teamDb().teamJoinRequest.create({
      data: {
        teamId: input.teamId,
        userId: actorId,
        status: 'PENDING',
      },
      include: {
        team: { select: { id: true, name: true, slug: true, logoUrl: true } },
      },
    })
    const audience = await getTeamAudienceUserIds(input.teamId)
    emitTeamEvent('teams:join_request_updated', [...audience, actorId])
    return request
  } catch (error: any) {
    if (error?.code === 'P2002') throw Errors.CONFLICT('Ya existe una solicitud pendiente para este equipo')
    throw error
  }
}

export async function cancelTeamJoinRequest(actorId: string, requestId: string) {
  const request = await teamDb().teamJoinRequest.findFirst({
    where: { id: requestId, userId: actorId, status: 'PENDING' },
  })
  if (!request) throw Errors.NOT_FOUND('Team join request')
  const result = await teamDb().teamJoinRequest.update({
    where: { id: requestId },
    data: { status: 'CANCELLED', respondedAt: new Date() },
  })
  emitTeamEvent('teams:join_request_updated', [actorId])
  return result
}

export async function respondToTeamJoinRequest(actorId: string, requestId: string, response: TeamJoinRequestResponse) {
  const request = await teamDb().teamJoinRequest.findFirst({
    where: { id: requestId, status: 'PENDING' },
  })
  if (!request) throw Errors.NOT_FOUND('Team join request')

  await requireTeamManager(actorId, request.teamId)

  if (response === 'DECLINE') {
    const result = await teamDb().teamJoinRequest.update({
      where: { id: requestId },
      data: { status: 'DECLINED', respondedAt: new Date(), reviewedById: actorId },
    })
    const audience = await getTeamAudienceUserIds(request.teamId)
    emitTeamEvent('teams:join_request_updated', [...audience, actorId, request.userId])
    return result
  }

  const existingMembership = await findActiveMembership(request.userId)
  if (existingMembership) throw Errors.CONFLICT('El jugador ya pertenece a un equipo activo')

  const accepted = await teamDb().$transaction(async (tx: any) => {
    await tx.teamMember.create({
      data: {
        teamId: request.teamId,
        userId: request.userId,
        role: 'MEMBER',
        competitiveRole: 'UNASSIGNED',
        status: 'ACTIVE',
      },
    })
    const acceptedRequest = await tx.teamJoinRequest.update({
      where: { id: request.id },
      data: { status: 'ACCEPTED', respondedAt: new Date(), reviewedById: actorId },
    })
    await tx.teamJoinRequest.updateMany({
      where: {
        userId: request.userId,
        status: 'PENDING',
        NOT: { id: request.id },
      },
      data: { status: 'EXPIRED', respondedAt: new Date() },
    })
    await tx.teamInvite.updateMany({
      where: {
        invitedUserId: request.userId,
        status: 'PENDING',
      },
      data: { status: 'EXPIRED', respondedAt: new Date() },
    })
    return acceptedRequest
  })
  const audience = await getTeamAudienceUserIds(request.teamId)
  emitTeamEvent('teams:updated', [...audience, actorId, request.userId])
  emitTeamEvent('teams:invite_updated', [...audience, actorId, request.userId])
  emitTeamEvent('teams:join_request_updated', [...audience, actorId, request.userId])
  return accepted
}

export async function updateTeamProfile(actorId: string, teamId: string, input: UpdateTeamProfileInput) {
  const membership = await teamDb().teamMember.findFirst({
    where: { teamId, userId: actorId, status: 'ACTIVE' },
  })
  if (membership?.role !== 'OWNER') throw Errors.FORBIDDEN()

  const data: Record<string, unknown> = {}
  if (typeof input.name === 'string') {
    const name = cleanTeamName(input.name)
    data.name = name
    data.slug = slugifyTeamName(name)
  }
  if (input.logoUrl !== undefined) data.logoUrl = cleanNullableUrl(input.logoUrl)
  if (input.bannerUrl !== undefined) data.bannerUrl = cleanNullableUrl(input.bannerUrl)
  if (input.description !== undefined) data.description = cleanDescription(input.description)
  if (input.availabilityDays !== undefined) data.availabilityDays = cleanAvailabilityDays(input.availabilityDays)

  const team = await teamDb().team.update({
    where: { id: teamId },
    data,
    include: {
      members: {
        where: { status: 'ACTIVE' },
        include: { user: { select: userSelect({ id: true, username: true, avatar: true, mmr: true, rank: true }) } },
      },
    },
  })
  const audience = await getTeamAudienceUserIds(teamId)
  emitTeamEvent('teams:updated', [...audience, actorId])
  return team
}

export async function assignTeamCompetitiveRole(
  actorId: string,
  teamId: string,
  targetUserId: string,
  competitiveRole: TeamCompetitiveRole,
) {
  const membership = await teamDb().teamMember.findFirst({
    where: { teamId, userId: actorId, status: 'ACTIVE' },
  })
  if (membership?.role !== 'OWNER') throw Errors.FORBIDDEN()

  const target = await teamDb().teamMember.findFirst({
    where: { teamId, userId: targetUserId, status: 'ACTIVE' },
  })
  if (!target) throw Errors.NOT_FOUND('Team member')

  if (competitiveRole === 'CAPTAIN') {
    const existingCaptain = await teamDb().teamMember.findFirst({
      where: {
        teamId,
        status: 'ACTIVE',
        competitiveRole: 'CAPTAIN',
        userId: { not: targetUserId },
      },
      select: { id: true },
    })
    if (existingCaptain) throw Errors.CONFLICT(`El equipo ya tiene ${TEAM_MAX_CAPTAINS} capitán activo`)
  }

  if (competitiveRole === 'STARTER' && target.competitiveRole !== 'STARTER') {
    const starterCount = await teamDb().teamMember.count({
      where: {
        teamId,
        status: 'ACTIVE',
        competitiveRole: 'STARTER',
      },
    })
    if (starterCount >= TEAM_MAX_STARTERS) {
      throw Errors.CONFLICT(`El equipo ya tiene ${TEAM_MAX_STARTERS} titulares activos`)
    }
  }

  const member = await teamDb().teamMember.update({
    where: { id: target.id },
    data: { competitiveRole },
  })
  const audience = await getTeamAudienceUserIds(teamId)
  emitTeamEvent('teams:updated', [...audience, actorId, targetUserId])
  return member
}

export async function removeTeamMember(actorId: string, teamId: string, targetUserId: string) {
  const actorMembership = await requireTeamManager(actorId, teamId)
  const targetMembership = await teamDb().teamMember.findFirst({
    where: { teamId, userId: targetUserId, status: 'ACTIVE' },
  })
  if (!targetMembership) throw Errors.NOT_FOUND('Team member')
  if (targetMembership.userId === actorId) throw Errors.CONFLICT('No puedes expulsarte a ti mismo del equipo')
  if (targetMembership.role === 'OWNER') throw Errors.FORBIDDEN()
  if (actorMembership.role === 'CAPTAIN' && targetMembership.role !== 'MEMBER') throw Errors.FORBIDDEN()

  const member = await teamDb().teamMember.update({
    where: { id: targetMembership.id },
    data: { status: 'KICKED' },
  })
  const audience = await getTeamAudienceUserIds(teamId)
  emitTeamEvent('teams:updated', [...audience, actorId, targetUserId])
  return member
}

function testBotUsername(teamName: string, index: number, suffix: string) {
  const base = slugifyTeamName(teamName)
    .replace(/-/g, '')
    .slice(0, 10)
  return `bot_${base || 'scrim'}_${index}_${suffix}`.slice(0, 20)
}

function uniqueIds(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))]
}

export async function addTestBotsToTeam(teamId: string, input: AddTestBotsToTeamInput = {}) {
  const targetSize = Math.max(1, Math.min(10, input.targetSize ?? 5))
  const team = await teamDb().team.findUnique({
    where: { id: teamId },
    include: {
      members: {
        where: { status: 'ACTIVE' },
        include: { user: { select: userSelect({ id: true, username: true, avatar: true, mmr: true, rank: true }) } },
      },
    },
  })
  if (!team) throw Errors.NOT_FOUND('Team')

  const activeCount = team.members.length
  const missing = Math.max(0, targetSize - activeCount)
  const createdBots = await teamDb().$transaction(async (tx: any) => {
    const bots: any[] = []
    for (let index = 0; index < missing; index += 1) {
      const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`
      const username = testBotUsername(team.name, activeCount + index + 1, suffix)
      const mmr = 1200
      const bot = await tx.user.create({
        data: {
          username,
          email: `${username}-${suffix}@bots.local`,
          password: null,
          role: 'USER',
          ...(prismaClientSupportsUserIsBot() ? { isBot: true } : {}),
          mmr,
          rank: calculateRank(mmr),
        },
        select: userSelect({ id: true, username: true, avatar: true, mmr: true, rank: true }),
      })
      await tx.teamMember.create({
        data: {
          teamId,
          userId: bot.id,
          role: 'MEMBER',
          status: 'ACTIVE',
        },
      })
      bots.push({ ...bot, isBot: true })
    }
    return bots
  })

  if (!prismaClientSupportsUserIsBot()) {
    for (const bot of createdBots) {
      await markBotUserRaw(db, bot.id)
    }
  }

  return {
    teamId,
    targetSize,
    activeCountBefore: activeCount,
    activeCountAfter: activeCount + createdBots.length,
    addedCount: createdBots.length,
    bots: createdBots,
  }
}
