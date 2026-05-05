import { Router } from 'express'
import { z } from 'zod'
import { authenticate, AuthRequest } from '../../shared/middlewares/authenticate'
import { getOnlineUserIds } from '../../infrastructure/socket/server'
import {
  assignTeamCompetitiveRole,
  cancelTeamJoinRequest,
  createTeam,
  createTeamInvite,
  createTeamJoinRequest,
  deleteTeam,
  getMyTeam,
  getPublicTeamBySlug,
  getPublicTeamStatsBySlug,
  getTeamsHub,
  listMyTeamInvites,
  removeTeamMember,
  respondToTeamInvite,
  respondToTeamJoinRequest,
  updateTeamProfile,
} from './teams.service'

export const teamsRouter = Router()

teamsRouter.use(authenticate)

const CreateTeamSchema = z.object({
  name: z.string().trim().min(2).max(80),
  logoUrl: z.string().trim().url().max(500).optional().nullable(),
  bannerUrl: z.string().trim().url().max(500).optional().nullable(),
  description: z.string().trim().max(500).optional().nullable(),
  countryCode: z.string().trim().length(2).optional().nullable(),
  about: z.string().trim().max(700).optional().nullable(),
  isRecruiting: z.boolean().optional().nullable(),
  recruitingRoles: z.array(z.enum(['RANGED', 'HEALER', 'OFFLANE', 'FLEX', 'TANK'])).max(5).optional().nullable(),
  socialLinks: z.array(z.object({
    label: z.string().trim().min(1).max(32),
    url: z.string().trim().url().max(500),
  })).max(5).optional().nullable(),
  availabilityDays: z.array(z.string().trim().min(1).max(24)).max(14).optional().nullable(),
})

const CreateInviteSchema = z.object({
  teamId: z.string().trim().min(1),
  invitedUserId: z.string().trim().min(1),
})

const InviteResponseSchema = z.object({
  response: z.enum(['ACCEPT', 'DECLINE']),
})

const TeamJoinRequestSchema = z.object({
  teamId: z.string().trim().min(1),
})

const TeamJoinRequestResponseSchema = z.object({
  response: z.enum(['ACCEPT', 'DECLINE']),
})

const UpdateTeamProfileSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  logoUrl: z.string().trim().url().max(500).optional().nullable(),
  bannerUrl: z.string().trim().url().max(500).optional().nullable(),
  description: z.string().trim().max(500).optional().nullable(),
  countryCode: z.string().trim().length(2).optional().nullable(),
  about: z.string().trim().max(700).optional().nullable(),
  isRecruiting: z.boolean().optional().nullable(),
  recruitingRoles: z.array(z.enum(['RANGED', 'HEALER', 'OFFLANE', 'FLEX', 'TANK'])).max(5).optional().nullable(),
  socialLinks: z.array(z.object({
    label: z.string().trim().min(1).max(32),
    url: z.string().trim().url().max(500),
  })).max(5).optional().nullable(),
  availabilityDays: z.array(z.string().trim().min(1).max(24)).max(14).optional().nullable(),
})

const UpdateCompetitiveRoleSchema = z.object({
  competitiveRole: z.enum(['UNASSIGNED', 'CAPTAIN', 'STARTER', 'SUBSTITUTE', 'COACH', 'STAFF']),
})

const PublicTeamStatsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(25).optional(),
  cursor: z.string().trim().optional(),
})

teamsRouter.get('/me', async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthRequest
    res.json({ team: await getMyTeam(authReq.userId) })
  } catch (err) {
    next(err)
  }
})

teamsRouter.get('/hub', async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthRequest
    res.json({ ...(await getTeamsHub(authReq.userId)), onlineUserIds: [...(await getOnlineUserIds())] })
  } catch (err) {
    next(err)
  }
})

teamsRouter.get('/public/:slug', async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthRequest
    res.json({ team: await getPublicTeamBySlug(req.params.slug, authReq.userId) })
  } catch (err) {
    next(err)
  }
})

teamsRouter.get('/public/:slug/stats', async (req, res, next) => {
  try {
    const query = PublicTeamStatsQuerySchema.parse(req.query ?? {})
    res.json(await getPublicTeamStatsBySlug(req.params.slug, query))
  } catch (err) {
    next(err)
  }
})

teamsRouter.post('/', async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthRequest
    const payload = CreateTeamSchema.parse(req.body ?? {})
    res.status(201).json({ team: await createTeam(authReq.userId, payload) })
  } catch (err) {
    next(err)
  }
})

teamsRouter.get('/invites', async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthRequest
    res.json({ invites: await listMyTeamInvites(authReq.userId) })
  } catch (err) {
    next(err)
  }
})

teamsRouter.post('/invites', async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthRequest
    const payload = CreateInviteSchema.parse(req.body ?? {})
    res.status(201).json({ invite: await createTeamInvite(authReq.userId, payload) })
  } catch (err) {
    next(err)
  }
})

teamsRouter.post('/invites/:inviteId/respond', async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthRequest
    const payload = InviteResponseSchema.parse(req.body ?? {})
    res.json({ invite: await respondToTeamInvite(authReq.userId, req.params.inviteId, payload.response) })
  } catch (err) {
    next(err)
  }
})

teamsRouter.post('/join-requests', async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthRequest
    const payload = TeamJoinRequestSchema.parse(req.body ?? {})
    res.status(201).json({ joinRequest: await createTeamJoinRequest(authReq.userId, payload) })
  } catch (err) {
    next(err)
  }
})

teamsRouter.post('/join-requests/:requestId/respond', async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthRequest
    const payload = TeamJoinRequestResponseSchema.parse(req.body ?? {})
    res.json({ joinRequest: await respondToTeamJoinRequest(authReq.userId, req.params.requestId, payload.response) })
  } catch (err) {
    next(err)
  }
})

teamsRouter.post('/join-requests/:requestId/cancel', async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthRequest
    res.json({ joinRequest: await cancelTeamJoinRequest(authReq.userId, req.params.requestId) })
  } catch (err) {
    next(err)
  }
})

teamsRouter.delete('/:teamId/members/:userId', async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthRequest
    res.json({ member: await removeTeamMember(authReq.userId, req.params.teamId, req.params.userId) })
  } catch (err) {
    next(err)
  }
})

teamsRouter.delete('/:teamId', async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthRequest
    res.json({ team: await deleteTeam(authReq.userId, req.params.teamId) })
  } catch (err) {
    next(err)
  }
})

teamsRouter.patch('/:teamId', async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthRequest
    const payload = UpdateTeamProfileSchema.parse(req.body ?? {})
    res.json({ team: await updateTeamProfile(authReq.userId, req.params.teamId, payload) })
  } catch (err) {
    next(err)
  }
})

teamsRouter.patch('/:teamId/members/:userId/competitive-role', async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthRequest
    const payload = UpdateCompetitiveRoleSchema.parse(req.body ?? {})
    res.json({
      member: await assignTeamCompetitiveRole(
        authReq.userId,
        req.params.teamId,
        req.params.userId,
        payload.competitiveRole,
      ),
    })
  } catch (err) {
    next(err)
  }
})
