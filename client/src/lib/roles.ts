export type PlayerRoleKey = 'RANGED' | 'HEALER' | 'OFFLANE' | 'FLEX' | 'TANK'

export const ROLE_META: Record<PlayerRoleKey, { label: string; accent: string; icon: string }> = {
  RANGED: {
    label: 'Ranged',
    accent: '#facc15',
    icon: '/roles/ranged.png',
  },
  HEALER: {
    label: 'Healer',
    accent: '#4ade80',
    icon: '/roles/healer.png',
  },
  OFFLANE: {
    label: 'Offlane',
    accent: '#ef4444',
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

function roleIconBase(icon: string) {
  return icon.replace(/\.(png|svg)$/i, '')
}

export function getRoleIconSources(role?: string | null) {
  const meta = getRoleMeta(role)
  if (!meta) return null
  const hasExt = /\.(png|svg)$/i.test(meta.icon)
  const base = roleIconBase(meta.icon)
  if (hasExt) {
    const primary = meta.icon
    const fallback = /\.png$/i.test(meta.icon) ? `${base}.svg` : `${base}.png`
    return { primary, fallback }
  }
  return {
    primary: `${base}.png`,
    fallback: `${base}.svg`,
  }
}
