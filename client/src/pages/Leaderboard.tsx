import { useEffect, useState } from "react";
import { api } from "../lib/api";

type LeaderboardEntry = {
  id: string;
  username: string;
  avatar: string | null;
  mmr: number;
  rank: string;
  wins: number;
  losses: number;
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
            <div
              key={entry.id}
              style={{
                display: "grid",
                gridTemplateColumns: "54px 1fr auto auto auto",
                gap: "0.8rem",
                alignItems: "center",
                border: "1px solid rgba(255,255,255,0.07)",
                background: "rgba(15,23,42,0.64)",
                padding: "0.65rem 0.8rem",
              }}
            >
              <div style={{ color: "#7dd3fc", fontWeight: 800 }}>
                #{index + 1}
              </div>
              <div style={{ color: "#e2e8f0", fontWeight: 700 }}>
                {entry.username}
              </div>
              <div style={{ color: "#cbd5e1", fontWeight: 700 }}>
                {entry.mmr.toLocaleString()} MMR
              </div>
              <div style={{ color: "#94a3b8", fontSize: "0.85rem" }}>
                {entry.wins}W/{entry.losses}L · {getWinrate(entry.wins, entry.losses)}
              </div>
              <div style={{ color: "#fbbf24", fontWeight: 700 }}>
                {entry.rank}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

