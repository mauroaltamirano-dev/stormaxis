import { Prisma } from '@prisma/client'
import { calculateRank, getLevelInfo } from './player-progression'

export const authUserSelect = Prisma.validator<Prisma.UserSelect>()({
  id: true,
  username: true,
  email: true,
  avatar: true,
  role: true,
  mmr: true,
  rank: true,
  wins: true,
  losses: true,
  mainRole: true,
  secondaryRole: true,
  countryCode: true,
  discordId: true,
  discordUsername: true,
  bnetId: true,
  bnetBattletag: true,
  googleId: true,
  createdAt: true,
  isBanned: true,
  isSuspect: true,
})

export type AuthUserRecord = Prisma.UserGetPayload<{ select: typeof authUserSelect }>

export const publicUserSelect = Prisma.validator<Prisma.UserSelect>()({
  id: true,
  username: true,
  avatar: true,
  mmr: true,
  rank: true,
  wins: true,
  losses: true,
  mainRole: true,
  secondaryRole: true,
  countryCode: true,
  createdAt: true,
})

export type PublicUserRecord = Prisma.UserGetPayload<{ select: typeof publicUserSelect }>

export function presentUser(record: AuthUserRecord) {
  const levelInfo = getLevelInfo(record.mmr)
  const totalMatches = record.wins + record.losses

  return {
    id: record.id,
    username: record.username,
    email: record.email,
    avatar: record.avatar,
    role: record.role,
    mmr: record.mmr,
    rank: calculateRank(record.mmr),
    wins: record.wins,
    losses: record.losses,
    mainRole: record.mainRole,
    secondaryRole: record.secondaryRole,
    countryCode: record.countryCode,
    discordId: record.discordId,
    discordUsername: record.discordUsername,
    bnetId: record.bnetId,
    bnetBattletag: record.bnetBattletag,
    googleId: record.googleId,
    createdAt: record.createdAt,
    level: levelInfo.level,
    levelProgressPct: levelInfo.progressPct,
    nextLevelAt: levelInfo.nextLevelAt,
    displayLevel: levelInfo.displayLevel,
    winrate: totalMatches > 0 ? Math.round((record.wins / totalMatches) * 100) : 0,
    linkedAccounts: [
      record.discordId
        ? {
            provider: 'discord' as const,
            providerUserId: record.discordId,
            displayName: record.discordUsername,
          }
        : null,
      record.googleId
        ? {
            provider: 'google' as const,
            providerUserId: record.googleId,
            displayName: record.email,
          }
        : null,
      record.bnetId
        ? {
            provider: 'bnet' as const,
            providerUserId: record.bnetId,
            displayName: record.bnetBattletag,
          }
        : null,
    ].filter(Boolean),
  }
}

export function presentPublicUser(record: PublicUserRecord) {
  const levelInfo = getLevelInfo(record.mmr)
  const totalMatches = record.wins + record.losses

  return {
    id: record.id,
    username: record.username,
    avatar: record.avatar,
    mmr: record.mmr,
    rank: calculateRank(record.mmr),
    wins: record.wins,
    losses: record.losses,
    mainRole: record.mainRole,
    secondaryRole: record.secondaryRole,
    countryCode: record.countryCode,
    createdAt: record.createdAt,
    level: levelInfo.level,
    levelProgressPct: levelInfo.progressPct,
    nextLevelAt: levelInfo.nextLevelAt,
    displayLevel: levelInfo.displayLevel,
    winrate: totalMatches > 0 ? Math.round((record.wins / totalMatches) * 100) : 0,
  }
}
