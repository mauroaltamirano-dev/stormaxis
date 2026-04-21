import type { PlayerRoleKey } from './roles'

export const INITIAL_RANKS = [
  { value: 'BRONCE', label: 'Bronce', color: '#8b6914', mmr: 100 },
  { value: 'PLATA', label: 'Plata', color: '#c0c0c0', mmr: 300 },
  { value: 'ORO', label: 'Oro', color: '#f0a500', mmr: 600 },
  { value: 'PLATINO', label: 'Platino', color: '#00c8ff', mmr: 1000 },
  { value: 'DIAMANTE', label: 'Diamante', color: '#7c4dff', mmr: 1450 },
  { value: 'MASTER', label: 'Master', color: '#ff4757', mmr: 1800 },
] as const

export type InitialRankValue = (typeof INITIAL_RANKS)[number]['value']

type OnboardingUserLike = {
  mainRole?: string | null
  secondaryRole?: string | null
}

export function requiresCompetitiveOnboarding(user?: OnboardingUserLike | null) {
  return Boolean(user && (!user.mainRole || !user.secondaryRole))
}

export function inferInitialRankFromMmr(mmr?: number | null): InitialRankValue {
  if (typeof mmr !== 'number') return 'ORO'

  return INITIAL_RANKS.reduce((closest, current) => {
    const currentDistance = Math.abs(current.mmr - mmr)
    const closestDistance = Math.abs(closest.mmr - mmr)
    return currentDistance < closestDistance ? current : closest
  }).value
}

export const ONBOARDING_ROLE_ORDER: PlayerRoleKey[] = [
  'RANGED',
  'HEALER',
  'OFFLANE',
  'FLEX',
  'TANK',
]
