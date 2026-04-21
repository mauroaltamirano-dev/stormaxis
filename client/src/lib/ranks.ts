export type RankLevel = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

export type RankMeta = {
  level: RankLevel;
  label: string;
  color: string;
  slug: string;
  iconSrc: string;
};

export const RANKS: RankMeta[] = [
  { level: 1, label: "Recruit", color: "#cccccc", slug: "recruit", iconSrc: "/ranked/recruit.png" },
  { level: 2, label: "Mercenary", color: "#57534e", slug: "mercenary", iconSrc: "/ranked/mercenary.png" },
  { level: 3, label: "Gladiator", color: "#374151", slug: "gladiator", iconSrc: "/ranked/gladiator.png" },
  { level: 4, label: "Veteran", color: "#22c55e", slug: "veteran", iconSrc: "/ranked/veteran.png" },
  { level: 5, label: "Champion", color: "#facc15", slug: "champion", iconSrc: "/ranked/champion.png" },
  { level: 6, label: "Elite", color: "#38bdf8", slug: "elite", iconSrc: "/ranked/elite.png" },
  { level: 7, label: "Warlord", color: "#818cf8", slug: "warlord", iconSrc: "/ranked/warlord.png" },
  { level: 8, label: "Mythic", color: "#c084fc", slug: "mythic", iconSrc: "/ranked/mythic.png" },
  { level: 9, label: "Legend", color: "#fb923c", slug: "legend", iconSrc: "/ranked/legend.png" },
  { level: 10, label: "Immortal", color: "#f43f5e", slug: "immortal", iconSrc: "/ranked/immortal.png" },
];

export const LEVEL_BANDS = [
  { level: 1, min: 0, max: 199 },
  { level: 2, min: 200, max: 399 },
  { level: 3, min: 400, max: 599 },
  { level: 4, min: 600, max: 799 },
  { level: 5, min: 800, max: 999 },
  { level: 6, min: 1000, max: 1199 },
  { level: 7, min: 1200, max: 1499 },
  { level: 8, min: 1500, max: 1699 },
  { level: 9, min: 1700, max: 1899 },
  { level: 10, min: 1900, max: null as number | null },
] as const;

export function getRankMeta(level: number): RankMeta {
  return RANKS.find((entry) => entry.level === level) ?? RANKS[0];
}

export function parseRankLevel(rank?: string | null, fallback = 1): RankLevel {
  if (!rank) return fallback as RankLevel;
  const parsed = Number(String(rank).replace("LVL_", ""));
  if (Number.isInteger(parsed) && parsed >= 1 && parsed <= 10) {
    return parsed as RankLevel;
  }
  return fallback as RankLevel;
}

export function getRankMetaFromMmr(rawMmr: number): RankMeta {
  const mmr = Math.max(0, rawMmr);
  const band =
    LEVEL_BANDS.find((candidate) => {
      if (candidate.max == null) return mmr >= candidate.min;
      return mmr >= candidate.min && mmr <= candidate.max;
    }) ?? LEVEL_BANDS[0];

  return getRankMeta(band.level);
}
