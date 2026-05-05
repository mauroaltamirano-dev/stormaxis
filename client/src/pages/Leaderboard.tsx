import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { api } from "../lib/api";
import { RankBadge } from "../components/RankBadge";
import { PageHeader } from "../components/PageHeader";
import { getRankMeta, parseRankLevel } from "../lib/ranks";
import { getCountryFlag, getCountryName } from "../lib/countries";
import { CountryBadge } from "../components/CountryBadge";
import { PlayerLink } from "../components/PlayerLink";
import { getRoleMeta, ROLE_META, type PlayerRoleKey } from "../lib/roles";
import { Filter, Trophy as TrophyIcon } from "lucide-react";

type LeaderboardEntry = {
  id: string;
  username: string;
  avatar: string | null;
  mmr: number;
  rank: string;
  wins: number;
  losses: number;
  countryCode?: string | null;
  mainRole?: PlayerRoleKey | null;
  secondaryRole?: PlayerRoleKey | null;
  level?: number;
};

type RankFilter = "all" | "1-3" | "4-6" | "7-10";

const rankFilters: Array<{ value: RankFilter; label: string; detail: string }> = [
  { value: "all", label: "Todos", detail: "Top 100" },
  { value: "7-10", label: "Elite", detail: "LVL 7-10" },
  { value: "4-6", label: "Core", detail: "LVL 4-6" },
  { value: "1-3", label: "Rising", detail: "LVL 1-3" },
];

function getWinrate(wins: number, losses: number) {
  const total = wins + losses;
  if (total <= 0) return "—";
  return `${Math.round((wins / total) * 100)}%`;
}

function getLevel(entry: LeaderboardEntry) {
  return entry.level ?? parseRankLevel(entry.rank);
}

function matchesRank(level: number, filter: RankFilter) {
  if (filter === "all") return true;
  if (filter === "1-3") return level >= 1 && level <= 3;
  if (filter === "4-6") return level >= 4 && level <= 6;
  return level >= 7 && level <= 10;
}

function matchesRole(entry: LeaderboardEntry, role: PlayerRoleKey | "all") {
  if (role === "all") return true;
  return entry.mainRole === role || entry.secondaryRole === role;
}

export function Leaderboard() {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [countryFilter, setCountryFilter] = useState("all");
  const [roleFilter, setRoleFilter] = useState<PlayerRoleKey | "all">("all");
  const [rankFilter, setRankFilter] = useState<RankFilter>("all");

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

  const enrichedEntries = useMemo(
    () => entries.map((entry, index) => ({ ...entry, position: index + 1, level: getLevel(entry) })),
    [entries],
  );

  const countryOptions = useMemo(() => {
    const codes = [...new Set(entries.map((entry) => entry.countryCode).filter((code): code is string => Boolean(code)))];
    return codes.sort((a, b) => getCountryName(a).localeCompare(getCountryName(b), "es"));
  }, [entries]);

  const filteredEntries = useMemo(
    () =>
      enrichedEntries.filter((entry) => {
        const countryMatches = countryFilter === "all" || entry.countryCode === countryFilter;
        return countryMatches && matchesRole(entry, roleFilter) && matchesRank(entry.level, rankFilter);
      }),
    [countryFilter, enrichedEntries, rankFilter, roleFilter],
  );

  const topFiltered = filteredEntries[0];
  const averageMmr = filteredEntries.length
    ? Math.round(filteredEntries.reduce((sum, entry) => sum + entry.mmr, 0) / filteredEntries.length)
    : 0;
  const hasActiveFilters = countryFilter !== "all" || roleFilter !== "all" || rankFilter !== "all";
  const clearFilters = () => {
    setCountryFilter("all");
    setRoleFilter("all");
    setRankFilter("all");
  };

  return (
    <div className="storm-page" style={{ display: "grid", gap: "1rem" }}>
      <PageHeader
        eyebrow="Ranking"
        title="Leaderboard global"
        description="La escalera competitiva del servidor SA con filtros de scouting por país, rol y rango competitivo."
        icon={<TrophyIcon size={18} />}
      />

      <section style={boardStyle}>
        <div style={toolbarStyle}>
          <div>
            <div style={eyebrowStyle}>Scouting filters</div>
            <strong style={toolbarTitleStyle}>{filteredEntries.length} jugadores visibles</strong>
            <div style={toolbarMetaStyle}>
              {topFiltered ? (
                <>
                  Líder del filtro: #{topFiltered.position}{" "}
                  <PlayerLink username={topFiltered.username} style={toolbarLeaderLinkStyle}>{topFiltered.username}</PlayerLink>
                </>
              ) : "Sin resultados para esta combinación"}
              {averageMmr ? ` · Promedio ${averageMmr.toLocaleString()} MMR` : ""}
            </div>
          </div>

          <button
            type="button"
            onClick={clearFilters}
            style={resetButtonStyle}
          >
            Reset
          </button>
        </div>

        <div style={filtersGridStyle}>
          <label style={filterLabelStyle}>
            <span>País</span>
            <select value={countryFilter} onChange={(event) => setCountryFilter(event.target.value)} style={selectStyle}>
              <option value="all">Todos los países</option>
              {countryOptions.map((code) => (
                <option key={code} value={code}>
                  {getCountryFlag(code)} {getCountryName(code)}
                </option>
              ))}
            </select>
          </label>

          <label style={filterLabelStyle}>
            <span>Rol</span>
            <select value={roleFilter} onChange={(event) => setRoleFilter(event.target.value as PlayerRoleKey | "all")} style={selectStyle}>
              <option value="all">Todos los roles</option>
              {(Object.keys(ROLE_META) as PlayerRoleKey[]).map((role) => (
                <option key={role} value={role}>
                  {ROLE_META[role].label}
                </option>
              ))}
            </select>
          </label>

          <div style={rankRailStyle}>
            {rankFilters.map((filter) => (
              <button
                key={filter.value}
                type="button"
                onClick={() => setRankFilter(filter.value)}
                style={rankFilter === filter.value ? activeRankButtonStyle : rankButtonStyle}
              >
                <span>{filter.label}</span>
                <small>{filter.detail}</small>
              </button>
            ))}
          </div>
        </div>

        {loading && <div style={{ color: "#94a3b8" }}>Cargando ranking…</div>}
        {error && !loading && <div style={errorStyle}>{error}</div>}

        {!loading && !error && (
          <div style={{ display: "grid", gap: "0.45rem" }}>
            {filteredEntries.length === 0 ? (
              <LeaderboardEmpty hasEntries={entries.length > 0} hasActiveFilters={hasActiveFilters} onReset={clearFilters} />
            ) : (
              filteredEntries.map((entry) => {
                const meta = getRankMeta(entry.level);
                const topGlow = entry.position <= 3;
                const mainRole = getRoleMeta(entry.mainRole);
                const secondaryRole = getRoleMeta(entry.secondaryRole);

                return (
                  <div
                    key={entry.id}
                    style={{
                      ...rowStyle,
                      borderColor: topGlow ? `${meta.color}33` : "rgba(255,255,255,0.07)",
                      background: topGlow
                        ? `linear-gradient(90deg, ${meta.color}12, rgba(15,23,42,0.76) 36%, rgba(15,23,42,0.92))`
                        : "rgba(15,23,42,0.64)",
                      boxShadow: topGlow ? `0 0 28px ${meta.color}14` : "none",
                    }}
                  >
                    <div style={{ color: topGlow ? meta.color : "#7dd3fc", fontWeight: 900, fontFamily: "var(--font-display)", letterSpacing: "0.08em" }}>
                      #{entry.position}
                    </div>
                    <RankBadge level={entry.level} size="sm" showLabel={false} showMmr={false} glow={topGlow ? "strong" : "medium"} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ color: "#e2e8f0", fontWeight: 800 }}>
                        <span style={{ marginRight: "0.35rem" }}><CountryBadge countryCode={entry.countryCode} compact /></span>
                        <PlayerLink username={entry.username} style={playerNameLinkStyle}>{entry.username}</PlayerLink>
                      </div>
                      <div style={{ ...rankLineStyle, color: meta.color }}>{meta.label}</div>
                    </div>
                    <div style={roleStackStyle}>
                      {mainRole ? <RolePill label={mainRole.label} accent={mainRole.accent} /> : <span style={mutedStyle}>Sin rol</span>}
                      {secondaryRole ? <RolePill label={secondaryRole.label} accent={secondaryRole.accent} ghost /> : null}
                    </div>
                    <div style={{ color: "#cbd5e1", fontWeight: 800 }}>{entry.mmr.toLocaleString()} MMR</div>
                    <div style={{ color: "#94a3b8", fontSize: "0.85rem" }}>
                      {entry.wins}W/{entry.losses}L · {getWinrate(entry.wins, entry.losses)}
                    </div>
                    <div style={{ color: topGlow ? meta.color : "#cbd5e1", fontWeight: 800, fontFamily: "var(--font-display)", letterSpacing: "0.06em" }}>
                      LVL {entry.level}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}
      </section>
    </div>
  );
}

function RolePill({ label, accent, ghost = false }: { label: string; accent: string; ghost?: boolean }) {
  return (
    <span style={{ ...rolePillStyle, borderColor: `${accent}${ghost ? "33" : "66"}`, background: ghost ? "rgba(15,23,42,0.38)" : `${accent}16`, color: ghost ? "rgba(226,232,240,0.72)" : accent }}>
      {label}
    </span>
  );
}

function LeaderboardEmpty({
  hasEntries,
  hasActiveFilters,
  onReset,
}: {
  hasEntries: boolean;
  hasActiveFilters: boolean;
  onReset: () => void;
}) {
  return (
    <div style={emptyStyle}>
      <Filter size={20} />
      <div style={{ minWidth: 0 }}>
        <strong style={emptyTitleStyle}>
          {hasEntries ? "No hay jugadores para esta combinación" : "Leaderboard preparando la primera muestra"}
        </strong>
        <p style={emptyTextStyle}>
          {hasEntries
            ? "Probá limpiar filtros o ampliar país, rol y rango competitivo."
            : "Cuando los testers completen partidas o scrims, el ranking va a mostrar MMR, roles y país para scouting."}
        </p>
      </div>
      {hasActiveFilters ? (
        <button type="button" onClick={onReset} style={emptyResetButtonStyle}>
          Limpiar filtros
        </button>
      ) : null}
    </div>
  );
}

const boardStyle: CSSProperties = { border: "1px solid rgba(112,158,255,.2)", borderRadius: "14px", background: "linear-gradient(180deg, rgba(10,20,39,.84), rgba(6,13,27,.8))", boxShadow: "0 14px 34px rgba(0,0,0,.2), inset 0 1px 0 rgba(255,255,255,.03)", padding: "1rem", display: "grid", gap: "0.9rem" };
const toolbarStyle: CSSProperties = { display: "flex", justifyContent: "space-between", gap: "1rem", alignItems: "start", border: "1px solid rgba(125,211,252,0.10)", borderRadius: "12px", background: "linear-gradient(135deg, rgba(14,116,144,0.12), rgba(15,23,42,0.42))", padding: "0.85rem" };
const eyebrowStyle: CSSProperties = { color: "#00c8ff", fontSize: "0.68rem", fontWeight: 900, letterSpacing: "0.18em", textTransform: "uppercase" };
const toolbarTitleStyle: CSSProperties = { display: "block", marginTop: "0.15rem", color: "#f8fafc", fontFamily: "var(--font-display)", letterSpacing: "0.06em", textTransform: "uppercase" };
const toolbarMetaStyle: CSSProperties = { marginTop: "0.25rem", color: "rgba(148,163,184,0.82)", fontSize: "0.82rem" };
const toolbarLeaderLinkStyle: CSSProperties = { color: "#bae6fd", fontWeight: 900, textDecoration: "underline", textDecorationColor: "rgba(125,211,252,0.35)", textUnderlineOffset: "3px" };
const resetButtonStyle: CSSProperties = { border: "1px solid rgba(148,163,184,0.18)", borderRadius: "10px", background: "rgba(2,6,23,0.45)", color: "#cbd5e1", padding: "0.55rem 0.7rem", cursor: "pointer", fontWeight: 900, letterSpacing: "0.08em", textTransform: "uppercase" };
const filtersGridStyle: CSSProperties = { display: "grid", gridTemplateColumns: "minmax(180px, 0.8fr) minmax(180px, 0.8fr) minmax(260px, 1.4fr)", gap: "0.7rem", alignItems: "end" };
const filterLabelStyle: CSSProperties = { display: "grid", gap: "0.35rem", color: "rgba(226,232,240,0.72)", fontSize: "0.68rem", fontWeight: 900, letterSpacing: "0.14em", textTransform: "uppercase" };
const selectStyle: CSSProperties = { width: "100%", border: "1px solid rgba(148,163,184,0.16)", borderRadius: "10px", background: "rgba(2,6,23,0.78)", color: "#e2e8f0", padding: "0.68rem 0.75rem", fontWeight: 800 };
const rankRailStyle: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: "0.45rem" };
const rankButtonStyle: CSSProperties = { border: "1px solid rgba(148,163,184,0.14)", borderRadius: "10px", background: "rgba(2,6,23,0.48)", color: "rgba(226,232,240,0.72)", padding: "0.55rem", cursor: "pointer", display: "grid", gap: "0.12rem", fontWeight: 900, textTransform: "uppercase" };
const activeRankButtonStyle: CSSProperties = { ...rankButtonStyle, border: "1px solid rgba(0,200,255,0.38)", background: "rgba(0,200,255,0.14)", color: "#bae6fd" };
const errorStyle: CSSProperties = { border: "1px solid rgba(248,113,113,0.25)", borderRadius: "12px", background: "rgba(127,29,29,0.12)", color: "#fecaca", padding: "0.7rem 0.8rem" };
const emptyStyle: CSSProperties = { display: "grid", gridTemplateColumns: "auto minmax(0, 1fr) auto", alignItems: "center", gap: "0.75rem", border: "1px dashed rgba(125,211,252,0.24)", borderRadius: "12px", background: "linear-gradient(135deg, rgba(14,116,144,0.10), rgba(2,6,23,0.35))", color: "rgba(226,232,240,0.82)", padding: "1rem", fontWeight: 800 };
const emptyTitleStyle: CSSProperties = { display: "block", color: "#e2e8f0", fontFamily: "var(--font-display)", letterSpacing: "0.06em", textTransform: "uppercase" };
const emptyTextStyle: CSSProperties = { margin: "0.25rem 0 0", color: "rgba(148,163,184,0.86)", fontSize: "0.82rem", lineHeight: 1.45 };
const emptyResetButtonStyle: CSSProperties = { border: "1px solid rgba(125,211,252,0.38)", borderRadius: "10px", background: "rgba(14,116,144,0.14)", color: "#7dd3fc", padding: "0.55rem 0.7rem", cursor: "pointer", fontWeight: 900, letterSpacing: "0.08em", textTransform: "uppercase", whiteSpace: "nowrap" };
const rowStyle: CSSProperties = { display: "grid", gridTemplateColumns: "54px 72px minmax(0, 1fr) minmax(130px, 0.6fr) auto auto auto", gap: "0.8rem", alignItems: "center", border: "1px solid", borderRadius: "10px", padding: "0.65rem 0.8rem" };
const rankLineStyle: CSSProperties = { marginTop: "0.16rem", fontSize: "0.78rem", fontWeight: 900, letterSpacing: "0.08em", textTransform: "uppercase" };
const playerNameLinkStyle: CSSProperties = { color: "#e2e8f0", fontWeight: 900, textDecoration: "underline", textDecorationColor: "rgba(125,211,252,0.22)", textUnderlineOffset: "3px" };
const roleStackStyle: CSSProperties = { display: "flex", gap: "0.35rem", flexWrap: "wrap", minWidth: 0 };
const rolePillStyle: CSSProperties = { border: "1px solid", borderRadius: "999px", padding: "0.22rem 0.42rem", fontSize: "0.68rem", fontWeight: 900, letterSpacing: "0.08em", textTransform: "uppercase", whiteSpace: "nowrap" };
const mutedStyle: CSSProperties = { color: "rgba(148,163,184,0.62)", fontSize: "0.78rem", fontWeight: 800 };
