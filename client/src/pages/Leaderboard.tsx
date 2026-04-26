import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { RankBadge } from "../components/RankBadge";
import { getRankMeta, parseRankLevel } from "../lib/ranks";
import { getCountryFlag } from "../lib/countries";

type LeaderboardEntry = {
  id: string;
  username: string;
  avatar: string | null;
  mmr: number;
  rank: string;
  wins: number;
  losses: number;
  countryCode?: string | null;
  level?: number;
};

function getWinrate(wins: number, losses: number) {
  const total = wins + losses;
  if (total <= 0) return "—";
  return `${Math.round((wins / total) * 100)}%`;
}

export function Leaderboard() {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    api
      .get<LeaderboardEntry[]>("/leaderboard")
      .then(({ data }) => {
        if (cancelled) return;
        setEntries(data);
        setError(null);
      })
      .catch(() => {
        if (!cancelled) setError("No pude cargar el leaderboard.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section
      style={{
        border: "1px solid var(--nexus-border)",
        background: "var(--nexus-card)",
        padding: "1rem",
        display: "grid",
        gap: "0.9rem",
      }}
    >
      <div>
        <div
          style={{
            color: "#7dd3fc",
            textTransform: "uppercase",
            letterSpacing: "0.18em",
            fontWeight: 800,
            fontSize: "0.68rem",
          }}
        >
          Ranking
        </div>
        <h2 style={{ margin: "0.35rem 0 0", color: "#e2e8f0" }}>
          Leaderboard global
        </h2>
      </div>

      {loading && <div style={{ color: "#94a3b8" }}>Cargando ranking…</div>}
      {error && !loading && (
        <div
          style={{
            border: "1px solid rgba(248,113,113,0.25)",
            background: "rgba(127,29,29,0.12)",
            color: "#fecaca",
            padding: "0.7rem 0.8rem",
          }}
        >
          {error}
        </div>
      )}

      {!loading && !error && (
        <div style={{ display: "grid", gap: "0.45rem" }}>
          {entries.map((entry, index) => (
            (() => {
              const level = entry.level ?? parseRankLevel(entry.rank);
              const meta = getRankMeta(level);
              const topGlow = index < 3;

              return (
                <div
                  key={entry.id}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "54px 72px minmax(0, 1fr) auto auto auto",
                    gap: "0.8rem",
                    alignItems: "center",
                    border: `1px solid ${topGlow ? `${meta.color}33` : "rgba(255,255,255,0.07)"}`,
                    background: topGlow
                      ? `linear-gradient(90deg, ${meta.color}12, rgba(15,23,42,0.76) 36%, rgba(15,23,42,0.92))`
                      : "rgba(15,23,42,0.64)",
                    boxShadow: topGlow ? `0 0 28px ${meta.color}14` : "none",
                    padding: "0.65rem 0.8rem",
                  }}
                >
                  <div
                    style={{
                      color: topGlow ? meta.color : "#7dd3fc",
                      fontWeight: 800,
                      fontFamily: "var(--font-display)",
                      letterSpacing: "0.08em",
                    }}
                  >
                    #{index + 1}
                  </div>
                  <RankBadge
                    level={level}
                    size="sm"
                    showLabel={false}
                    showMmr={false}
                    glow={topGlow ? "strong" : "medium"}
                  />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ color: "#e2e8f0", fontWeight: 700 }}>
                      <span style={{ marginRight: "0.35rem" }}>
                        {getCountryFlag(entry.countryCode)}
                      </span>
                      {entry.username}
                    </div>
                    <div
                      style={{
                        marginTop: "0.16rem",
                        color: meta.color,
                        fontSize: "0.78rem",
                        fontWeight: 800,
                        letterSpacing: "0.08em",
                        textTransform: "uppercase",
                      }}
                    >
                      {meta.label}
                    </div>
                  </div>
                  <div style={{ color: "#cbd5e1", fontWeight: 700 }}>
                    {entry.mmr.toLocaleString()} MMR
                  </div>
                  <div style={{ color: "#94a3b8", fontSize: "0.85rem" }}>
                    {entry.wins}W/{entry.losses}L · {getWinrate(entry.wins, entry.losses)}
                  </div>
                  <div
                    style={{
                      color: topGlow ? meta.color : "#cbd5e1",
                      fontWeight: 700,
                      fontFamily: "var(--font-display)",
                      letterSpacing: "0.06em",
                    }}
                  >
                    LVL {level}
                  </div>
                </div>
              );
            })()
          ))}
        </div>
      )}
    </section>
  );
}
