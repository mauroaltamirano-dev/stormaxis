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
  countryCode?: string | null
  about?: string | null
  isRecruiting?: boolean | null
  recruitingRoles?: string[] | null
  socialLinks?: TeamSocialLinkInput[] | null
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
  countryCode?: string | null
  about?: string | null
  isRecruiting?: boolean | null
  recruitingRoles?: string[] | null
  socialLinks?: TeamSocialLinkInput[] | null
  availabilityDays?: string[] | null
}

export type AddTestBotsToTeamInput = {
  targetSize?: number
}

export type TeamSocialLinkInput = {
  label?: string | null
  url?: string | null
}

const TEAM_NAME_MAX_LENGTH = 80
const TEAM_PROFILE_TEXT_MAX_LENGTH = 500
const TEAM_ABOUT_MAX_LENGTH = 700
const TEAM_AVAILABILITY_DAY_MAX = 14
const TEAM_MAX_STARTERS = 5
const TEAM_MAX_CAPTAINS = 1
const TEAM_RECRUITING_ROLES = new Set(['RANGED', 'HEALER', 'OFFLANE', 'FLEX', 'TANK'])
const TEAM_SOCIAL_LINK_MAX = 5

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

function prismaClientSupportsTeamPublicFields() {
  const teamModel = Prisma.dmmf.datamodel.models.find((model) => model.name === 'Team')
  return Boolean(teamModel?.fields.some((field) => field.name === 'countryCode'))
}

function userSelect<T extends Record<string, boolean>>(select: T) {
  return {
    ...select,
    ...(prismaClientSupportsUserIsBot() ? { isBot: true } : {}),
  }
}

function teamPublicSelect() {
  return prismaClientSupportsTeamPublicFields()
    ? {
        countryCode: true,
        about: true,
        isRecruiting: true,
        recruitingRoles: true,
        socialLinks: true,
      }
    : {}
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

function cleanAbout(value?: string | null) {
  const trimmed = value?.trim() ?? ''
  return trimmed.length > 0 ? trimmed.slice(0, TEAM_ABOUT_MAX_LENGTH) : null
}

function cleanCountryCode(value?: string | null) {
  const trimmed = value?.trim().toUpperCase() ?? ''
  return /^[A-Z]{2}$/.test(trimmed) ? trimmed : null
}

function cleanRecruitingRoles(value?: string[] | null) {
  if (!Array.isArray(value)) return null
  const roles = uniqueIds(
    value
      .filter((role): role is string => typeof role === 'string')
      .map((role) => role.trim().toUpperCase())
      .filter((role) => TEAM_RECRUITING_ROLES.has(role)),
  )
  return roles.length > 0 ? roles : null
}

function cleanSocialLinks(value?: TeamSocialLinkInput[] | null) {
  if (!Array.isArray(value)) return null
  const links = value
    .map((entry) => ({
      label: entry?.label?.trim().slice(0, 32) ?? '',
      url: entry?.url?.trim().slice(0, TEAM_PROFILE_TEXT_MAX_LENGTH) ?? '',
    }))
    .filter((entry) => entry.label.length > 0 && /^https?:\/\//i.test(entry.url))
    .slice(0, TEAM_SOCIAL_LINK_MAX)
  return links.length > 0 ? links : null
}

function hasTeamPublicProfileInput(input: Partial<CreateTeamInput & UpdateTeamProfileInput>) {
  return (
    input.countryCode !== undefined ||
    input.about !== undefined ||
    input.isRecruiting !== undefined ||
    input.recruitingRoles !== undefined ||
    input.socialLinks !== undefined
  )
}

function buildTeamPublicData(input: Partial<CreateTeamInput & UpdateTeamProfileInput>) {
  const data: Record<string, unknown> = {}
  if (input.countryCode !== undefined) data.countryCode = cleanCountryCode(input.countryCode)
  if (input.about !== undefined) data.about = cleanAbout(input.about)
  if (input.isRecruiting !== undefined) data.isRecruiting = Boolean(input.isRecruiting)
  if (input.recruitingRoles !== undefined) data.recruitingRoles = cleanRecruitingRoles(input.recruitingRoles)
  if (input.socialLinks !== undefined) data.socialLinks = cleanSocialLinks(input.socialLinks)
  return data
}

function isMissingTeamPublicProfileColumn(err: unknown) {
  const candidate = err as { code?: string; meta?: { code?: string; message?: string }; message?: string }
  const message = `${candidate.meta?.message ?? ''} ${candidate.message ?? ''}`
  return (
    candidate.code === 'P2010' ||
    candidate.code === 'P2022' ||
    candidate.meta?.code === '42703' ||
    message.includes('countryCode') ||
    message.includes('isRecruiting') ||
    message.includes('recruitingRoles') ||
    message.includes('socialLinks')
  )
}

async function getTeamPublicFieldsRaw(teamIds: string[]) {
  const ids = uniqueIds(teamIds)
  if (ids.length === 0) return new Map<string, Record<string, unknown>>()
  try {
    const rows = await db.$queryRaw<Array<{
      id: string
      countryCode: string | null
      about: string | null
      isRecruiting: boolean
      recruitingRoles: unknown
      socialLinks: unknown
    }>>(Prisma.sql`
      SELECT
        "id",
        "countryCode",
        "about",
        "isRecruiting",
        "recruitingRoles",
        "socialLinks"
      FROM "Team"
      WHERE "id" IN (${Prisma.join(ids)})
    `)
    return new Map(rows.map((row) => [row.id, {
      countryCode: row.countryCode,
      about: row.about,
      isRecruiting: row.isRecruiting,
      recruitingRoles: row.recruitingRoles,
      socialLinks: row.socialLinks,
    }]))
  } catch (err) {
    if (isMissingTeamPublicProfileColumn(err)) return new Map<string, Record<string, unknown>>()
    throw err
  }
}

async function persistTeamPublicFieldsRaw(teamId: string, input: Partial<CreateTeamInput & UpdateTeamProfileInput>) {
  if (!hasTeamPublicProfileInput(input)) return
  const assignments: Prisma.Sql[] = []
  if (input.countryCode !== undefined) assignments.push(Prisma.sql`"countryCode" = ${cleanCountryCode(input.countryCode)}`)
  if (input.about !== undefined) assignments.push(Prisma.sql`"about" = ${cleanAbout(input.about)}`)
  if (input.isRecruiting !== undefined) assignments.push(Prisma.sql`"isRecruiting" = ${Boolean(input.isRecruiting)}`)
  if (input.recruitingRoles !== undefined) {
    const rolesJson = JSON.stringify(cleanRecruitingRoles(input.recruitingRoles))
    assignments.push(Prisma.sql`"recruitingRoles" = ${rolesJson}::jsonb`)
  }
  if (input.socialLinks !== undefined) {
    const linksJson = JSON.stringify(cleanSocialLinks(input.socialLinks))
    assignments.push(Prisma.sql`"socialLinks" = ${linksJson}::jsonb`)
  }
  if (assignments.length === 0) return
  try {
    await db.$executeRaw(Prisma.sql`
      UPDATE "Team"
      SET ${Prisma.join(assignments, ', ')}
      WHERE "id" = ${teamId}
    `)
  } catch (err) {
    if (!isMissingTeamPublicProfileColumn(err)) throw err
  }
}

async function enrichTeamsWithPublicFields<T extends { id: string }>(teams: T[]) {
  if (prismaClientSupportsTeamPublicFields() || teams.length === 0) return teams
  const fieldsById = await getTeamPublicFieldsRaw(teams.map((team) => team.id))
  return teams.map((team) => Object.assign(
    {
      countryCode: null,
      about: null,
      isRecruiting: false,
      recruitingRoles: null,
      socialLinks: null,
    },
    team,
    fieldsById.get(team.id) ?? {},
  ))
}

async function enrichTeamWithPublicFields<T extends { id: string }>(team: T) {
  return (await enrichTeamsWithPublicFields([team]))[0]
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
      ...(prismaClientSupportsTeamPublicFields() ? buildTeamPublicData(input) : {}),
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
  if (!prismaClientSupportsTeamPublicFields()) {
    await persistTeamPublicFieldsRaw(team.id, input)
  }
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
  const teams = await teamDb().team.findMany({
    where: { status: 'ACTIVE' },
    select: {
      id: true,
      name: true,
      slug: true,
      logoUrl: true,
      bannerUrl: true,
      description: true,
      ...teamPublicSelect(),
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
  return enrichTeamsWithPublicFields(teams)
}

export async function getPublicTeamBySlug(slug: string, viewerId?: string | null) {
  const normalized = slug.trim()
  if (!normalized) throw Errors.NOT_FOUND('Team')

  const team = await teamDb().team.findFirst({
    where: { slug: normalized, status: 'ACTIVE' },
    select: {
      id: true,
      name: true,
      slug: true,
      logoUrl: true,
      bannerUrl: true,
      description: true,
      ...teamPublicSelect(),
      availabilityDays: true,
      ownerId: true,
      members: {
        where: { status: 'ACTIVE' },
        select: {
          userId: true,
          role: true,
          competitiveRole: true,
          user: {
            select: userSelect({
              id: true,
              username: true,
              avatar: true,
              mmr: true,
              rank: true,
              mainRole: true,
              secondaryRole: true,
              countryCode: true,
            }),
          },
        },
      },
    },
  })
  if (!team) throw Errors.NOT_FOUND('Team')
  const enrichedTeam = await enrichTeamWithPublicFields(team)
  const viewerMembership = viewerId ? enrichedTeam.members.find((member: any) => member.userId === viewerId) ?? null : null
  const viewerCanManageTeam = canManageTeamRole(viewerMembership?.role)
  const [viewerPendingInvite, viewerPendingJoinRequest, viewerActiveMembership] = viewerId
    ? await Promise.all([
        teamDb().teamInvite.findFirst({
          where: { teamId: enrichedTeam.id, invitedUserId: viewerId, status: 'PENDING' },
          select: { id: true, status: true, createdAt: true },
        }),
        teamDb().teamJoinRequest.findFirst({
          where: { teamId: enrichedTeam.id, userId: viewerId, status: 'PENDING' },
          select: { id: true, status: true, createdAt: true },
        }),
        findActiveMembership(viewerId),
      ])
    : [null, null, null]
  const [pendingInvites, incomingJoinRequests] = viewerCanManageTeam
    ? await Promise.all([
        teamDb().teamInvite.findMany({
          where: { teamId: enrichedTeam.id, status: 'PENDING' },
          select: {
            id: true,
            status: true,
            createdAt: true,
            invitedUser: { select: userSelect({ id: true, username: true, avatar: true, mmr: true, rank: true }) },
            invitedBy: { select: userSelect({ id: true, username: true, avatar: true }) },
          },
          orderBy: { createdAt: 'desc' },
        }),
        teamDb().teamJoinRequest.findMany({
          where: { teamId: enrichedTeam.id, status: 'PENDING' },
          select: {
            id: true,
            status: true,
            createdAt: true,
            user: { select: userSelect({ id: true, username: true, avatar: true, mmr: true, rank: true }) },
          },
          orderBy: { createdAt: 'desc' },
        }),
      ])
    : [[], []]
  return {
    ...enrichedTeam,
    viewerRole: viewerMembership?.role ?? null,
    canEdit: viewerMembership?.role === 'OWNER',
    viewerHasTeam: Boolean(viewerActiveMembership),
    viewerPendingInvite,
    viewerPendingJoinRequest,
    pendingInvites,
    incomingJoinRequests,
  }
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
  if (prismaClientSupportsTeamPublicFields()) Object.assign(data, buildTeamPublicData(input))
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
  if (!prismaClientSupportsTeamPublicFields()) {
    await persistTeamPublicFieldsRaw(teamId, input)
  }
  const audience = await getTeamAudienceUserIds(teamId)
  emitTeamEvent('teams:updated', [...audience, actorId])
  return enrichTeamWithPublicFields(team)
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

export async function deleteTeam(actorId: string, teamId: string) {
  const membership = await teamDb().teamMember.findFirst({
    where: { teamId, userId: actorId, status: 'ACTIVE' },
  })
  if (membership?.role !== 'OWNER') throw Errors.FORBIDDEN()

  const audience = await getTeamAudienceUserIds(teamId)
  const archived = await teamDb().$transaction(async (tx: any) => {
    const team = await tx.team.update({
      where: { id: teamId },
      data: { status: 'ARCHIVED' },
    })
    await tx.teamMember.updateMany({
      where: { teamId, status: 'ACTIVE' },
      data: { status: 'LEFT' },
    })
    await tx.teamInvite.updateMany({
      where: { teamId, status: 'PENDING' },
      data: { status: 'EXPIRED', respondedAt: new Date() },
    })
    await tx.teamJoinRequest.updateMany({
      where: { teamId, status: 'PENDING' },
      data: { status: 'EXPIRED', respondedAt: new Date() },
    })
    await tx.scrimSearch?.updateMany?.({
      where: { teamId, status: { in: ['OPEN', 'CHALLENGED'] } },
      data: { status: 'EXPIRED' },
    })
    await tx.scrimChallenge?.updateMany?.({
      where: {
        status: 'PENDING',
        OR: [{ fromTeamId: teamId }, { toTeamId: teamId }],
      },
      data: { status: 'EXPIRED', respondedAt: new Date() },
    })
    return team
  })
  emitTeamEvent('teams:updated', [...audience, actorId])
  emitTeamEvent('teams:invite_updated', [...audience, actorId])
  emitTeamEvent('teams:join_request_updated', [...audience, actorId])
  return archived
}

type TeamStatsOptions = {
  limit?: number
  cursor?: string | null
}

function clampStatsLimit(value?: number) {
  if (!Number.isFinite(value ?? 0)) return 10
  return Math.max(1, Math.min(25, Math.floor(value ?? 10)))
}

function getTeamSideFromScrimDetails(teamId: string, scrimDetails: any) {
  if (scrimDetails?.team1Id === teamId) return 1
  if (scrimDetails?.team2Id === teamId) return 2
  return null
}

function getMatchResultForTeam(teamId: string, match: any): 'W' | 'L' {
  const side = getTeamSideFromScrimDetails(teamId, match.scrimDetails)
  return side != null && match.winner === side ? 'W' : 'L'
}

function serializeTeamHistoryMatch(teamId: string, match: any) {
  const side = getTeamSideFromScrimDetails(teamId, match.scrimDetails)
  const opponentName = side === 1 ? match.scrimDetails?.team2Name : match.scrimDetails?.team1Name
  return {
    id: match.id,
    createdAt: match.createdAt,
    selectedMap: match.selectedMap ?? 'Mapa no definido',
    duration: match.duration ?? null,
    result: getMatchResultForTeam(teamId, match),
    teamSide: side,
    winner: match.winner ?? null,
    opponentName: opponentName ?? 'Equipo rival',
  }
}

function buildTeamStatsPayload(teamId: string, allMatches: any[], pageMatches: any[], limit: number) {
  const summaryMatches = allMatches.filter((match) => getTeamSideFromScrimDetails(teamId, match.scrimDetails) != null)
  const wins = summaryMatches.filter((match) => getMatchResultForTeam(teamId, match) === 'W').length
  const losses = Math.max(0, summaryMatches.length - wins)
  const mapBuckets = new Map<string, { map: string; matches: number; wins: number }>()
  for (const match of summaryMatches) {
    const map = match.selectedMap ?? 'Mapa no definido'
    const current = mapBuckets.get(map) ?? { map, matches: 0, wins: 0 }
    current.matches += 1
    if (getMatchResultForTeam(teamId, match) === 'W') current.wins += 1
    mapBuckets.set(map, current)
  }

  const chronological = [...summaryMatches].reverse()
  let rollingWins = 0
  const performance = chronological.map((match, index) => {
    if (getMatchResultForTeam(teamId, match) === 'W') rollingWins += 1
    return {
      matchId: match.id,
      createdAt: match.createdAt,
      value: Math.round((rollingWins / (index + 1)) * 100),
    }
  })

  const visiblePageMatches = pageMatches.slice(0, limit)
  return {
    summary: {
      totalMatches: summaryMatches.length,
      wins,
      losses,
      winrate: summaryMatches.length > 0 ? Math.round((wins / summaryMatches.length) * 100) : 0,
      recentResults: summaryMatches.slice(0, 5).map((match) => getMatchResultForTeam(teamId, match)),
    },
    mapStats: [...mapBuckets.values()]
      .map((entry) => ({
        ...entry,
        winrate: entry.matches > 0 ? Math.round((entry.wins / entry.matches) * 100) : 0,
      }))
      .sort((a, b) => b.matches - a.matches || a.map.localeCompare(b.map)),
    performance,
    matches: visiblePageMatches.map((match) => serializeTeamHistoryMatch(teamId, match)),
    nextCursor: pageMatches.length > limit ? visiblePageMatches[visiblePageMatches.length - 1]?.createdAt?.toISOString?.() ?? null : null,
  }
}

export async function getPublicTeamStatsBySlug(slug: string, options: TeamStatsOptions = {}) {
  const normalized = slug.trim()
  if (!normalized) throw Errors.NOT_FOUND('Team')
  const team = await teamDb().team.findFirst({
    where: { slug: normalized, status: 'ACTIVE' },
    select: { id: true, slug: true, name: true },
  })
  if (!team) throw Errors.NOT_FOUND('Team')

  const limit = clampStatsLimit(options.limit)
  const cursorDate = options.cursor ? new Date(options.cursor) : null
  const baseWhere = {
    status: 'COMPLETED',
    origin: { in: ['SCRIM_SELF_SERVE', 'SCRIM_ADMIN'] },
    scrimDetails: { OR: [{ team1Id: team.id }, { team2Id: team.id }] },
  }
  const include = { scrimDetails: true }
  const orderBy = { createdAt: 'desc' }
  const [allMatches, pageMatches] = await Promise.all([
    teamDb().match.findMany({
      where: baseWhere,
      include,
      orderBy,
    }),
    teamDb().match.findMany({
      where: {
        ...baseWhere,
        ...(cursorDate && !Number.isNaN(cursorDate.getTime()) ? { createdAt: { lt: cursorDate } } : {}),
      },
      include,
      orderBy,
      take: limit + 1,
    }),
  ])

  return buildTeamStatsPayload(team.id, allMatches, pageMatches, limit)
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
