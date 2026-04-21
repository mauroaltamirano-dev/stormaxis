export type PlayerRoleKey = 'RANGED' | 'HEALER' | 'OFFLANE' | 'FLEX' | 'TANK'

export const ROLE_META: Record<PlayerRoleKey, { label: string; accent: string; icon: string }> = {
  RANGED: {
    label: 'Ranged',
    accent: '#fb7185',
    icon: '/roles/ranged.svg',
  },
  HEALER: {
    label: 'Healer',
    accent: '#4ade80',
    icon: '/roles/healer.png',
  },
  OFFLANE: {
    label: 'Offlane',
    accent: '#f97316',
    icon: '/roles/offlane.svg',
  },
  FLEX: {
    label: 'Flex',
    accent: '#a78bfa',
    icon: '/roles/flex.png',
  },
  TANK: {
    label: 'Tank',
    accent: '#38bdf8',
    icon: '/roles/tank.svg',
  },
}

export function getRoleMeta(role?: string | null) {
  if (!role || !(role in ROLE_META)) return null
  return ROLE_META[role as PlayerRoleKey]
}
