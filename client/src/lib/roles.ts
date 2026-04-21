export type PlayerRoleKey = 'TANK' | 'DPS' | 'BRUISER' | 'SUPPORT' | 'HEALER'

export const ROLE_META: Record<PlayerRoleKey, { label: string; accent: string; icon: string }> = {
  TANK: {
    label: 'Tank',
    accent: '#38bdf8',
    icon: '/roles/tank.svg',
  },
  DPS: {
    label: 'DPS',
    accent: '#fb7185',
    icon: '/roles/dps.webp',
  },
  BRUISER: {
    label: 'Offlane',
    accent: '#f97316',
    icon: '/roles/bruiser.webp',
  },
  SUPPORT: {
    label: 'Support',
    accent: '#a78bfa',
    icon: '/roles/support.svg',
  },
  HEALER: {
    label: 'Healer',
    accent: '#4ade80',
    icon: '/roles/healer.webp',
  },
}

export function getRoleMeta(role?: string | null) {
  if (!role || !(role in ROLE_META)) return null
  return ROLE_META[role as PlayerRoleKey]
}
