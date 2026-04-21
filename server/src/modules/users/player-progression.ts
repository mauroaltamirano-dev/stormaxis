export interface LevelInfo {
  level: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10
  currentFloor: number
  nextLevelAt: number | null
  progressPct: number
  displayLevel: string
}

interface LevelBand {
  level: LevelInfo['level']
  min: number
  max: number | null
}

const LEVEL_BANDS: LevelBand[] = [
  { level: 1, min: 0, max: 199 },
  { level: 2, min: 200, max: 399 },
  { level: 3, min: 400, max: 599 },
  { level: 4, min: 600, max: 799 },
  { level: 5, min: 800, max: 999 },
  { level: 6, min: 1000, max: 1199 },
  { level: 7, min: 1200, max: 1499 },
  { level: 8, min: 1500, max: 1699 },
  { level: 9, min: 1700, max: 1899 },
  { level: 10, min: 1900, max: null },
]

export function getLevelInfo(rawMmr: number): LevelInfo {
  const mmr = Math.max(0, rawMmr)
  const band = LEVEL_BANDS.find((candidate) => {
    if (candidate.max == null) return mmr >= candidate.min
    return mmr >= candidate.min && mmr <= candidate.max
  }) ?? LEVEL_BANDS[0]

  if (band.max == null) {
    return {
      level: band.level,
      currentFloor: band.min,
      nextLevelAt: null,
      progressPct: 100,
      displayLevel: `Lvl ${band.level}`,
    }
  }

  const span = band.max - band.min + 1
  const progressPct = Math.max(0, Math.min(100, Math.floor(((mmr - band.min + 1) / span) * 100)))

  return {
    level: band.level,
    currentFloor: band.min,
    nextLevelAt: band.max + 1,
    progressPct,
    displayLevel: `Lvl ${band.level}`,
  }
}

export function calculateRank(mmr: number): string {
  const level = getLevelInfo(mmr).level
  return `LVL_${level}`
}
