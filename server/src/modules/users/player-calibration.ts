export const INITIAL_RANK_OPTIONS = [
  'BRONCE',
  'PLATA',
  'ORO',
  'PLATINO',
  'DIAMANTE',
  'MASTER',
] as const

export type InitialRankKey = (typeof INITIAL_RANK_OPTIONS)[number]

export const INITIAL_RANK_MMR: Record<InitialRankKey, number> = {
  BRONCE: 100,
  PLATA: 300,
  ORO: 600,
  PLATINO: 1000,
  DIAMANTE: 1450,
  MASTER: 1800,
}

export function getInitialMmrFromRank(rank?: InitialRankKey | null) {
  return rank ? INITIAL_RANK_MMR[rank] : 1200
}
