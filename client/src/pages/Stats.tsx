import type { CSSProperties, ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  Activity,
  Clock3,
  Crosshair,
  Database,
  Map as MapIcon,
  Swords,
  TrendingUp,
  Trophy,
} from "lucide-react";
import { MAP_ID_BY_NAME } from "@nexusgg/shared";
import { api } from "../lib/api";
import { useAuthStore } from "../stores/auth.store";
import { PageHeader } from "../components/PageHeader";

type MatchHistoryEntry = {
  id: string;
  team: number;
  mmrDelta: number | null;
  match: {
    id: string;
    status: string;
    selectedMap: string | null;
    winner: number | null;
    createdAt: string;
    endedAt: string | null;
    replayUploads?: Array<{
      id: string;
      status: string;
      parsedMap: string | null;
      parsedWinnerTeam: number | null;
      createdAt: string;
    }>;
  };
};

type RangeFilter = "all" | "30d" | "7d";

type MapStat = {
  name: string;
  played: number;
  wins: number;
  losses: number;
  winrate: number;
};

function getMatchMapImage(selectedMap: string | null) {
  if (!selectedMap) return null;
  const mapId = MAP_ID_BY_NAME[selectedMap];
  return mapId ? `/maps/${mapId}.webp` : null;
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "short",
    year: "2-digit",
  });
}

function formatRelative(value: string) {
  const diffMs = Date.now() - new Date(value).getTime();
  const minutes = Math.max(1, Math.floor(diffMs / 60_000));
  if (minutes < 60) return `${minutes} min atrás`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h atrás`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} d atrás`;
  return formatDate(value);
}

function isCompleted(entry: MatchHistoryEntry) {
  return entry.match.status === "COMPLETED" && entry.match.winner != null;
}

function didWin(entry: MatchHistoryEntry) {
  return isCompleted(entry) && entry.match.winner === entry.team;
}

function winrate(wins: number, losses: number) {
  const total = wins + losses;
  if (!total) return 0;
  return Math.round((wins / total) * 100);
}

function currentStreak(matches: MatchHistoryEntry[]) {
  const completed = matches.filter(isCompleted);
  if (!completed.length) return { label: "Sin racha", tone: "#94a3b8", count: 0 };

  const firstWon = didWin(completed[0]);
  let count = 0;
  for (const match of completed) {
    if (didWin(match) !== firstWon) break;
    count += 1;
  }

  return {
    label: `${firstWon ? "W" : "L"}${count}`,
    tone: firstWon ? "#4ade80" : "#f87171",
    count,
  };
}

function filterByRange(matches: MatchHistoryEntry[], range: RangeFilter) {
  if (range === "all") return matches;
  const days = range === "30d" ? 30 : 7;
  const since = Date.now() - days * 24 * 60 * 60 * 1000;
  return matches.filter((entry) => new Date(entry.match.createdAt).getTime() >= since);
}

function buildMapStats(matches: MatchHistoryEntry[]): MapStat[] {
  const byMap = new Map<string, { wins: number; losses: number }>();

  for (const entry of matches.filter(isCompleted)) {
    const map = entry.match.selectedMap ?? "Mapa no registrado";
    const current = byMap.get(map) ?? { wins: 0, losses: 0 };
    if (didWin(entry)) current.wins += 1;
    else current.losses += 1;
    byMap.set(map, current);
  }

  return [...byMap.entries()]
    .map(([name, stat]) => ({
      name,
      played: stat.wins + stat.losses,
      wins: stat.wins,
      losses: stat.losses,
      winrate: winrate(stat.wins, stat.losses),
    }))
    .sort((a, b) => b.played - a.played || b.winrate - a.winrate)
    .slice(0, 5);
}

function buildMmrTrend(matches: MatchHistoryEntry[], currentMmr: number) {
  const completedWithDelta = matches
    .filter(isCompleted)
    .filter((entry) => typeof entry.mmrDelta === "number")
    .slice(0, 12)
    .reverse();

  const totalDelta = completedWithDelta.reduce((sum, entry) => sum + (entry.mmrDelta ?? 0), 0);
  let running = currentMmr - totalDelta;
  const points = [{ label: "Inicio", value: running }];

  for (const entry of completedWithDelta) {
    running += entry.mmrDelta ?? 0;
    points.push({
      label: entry.match.selectedMap ?? "Match",
      value: running,
    });
  }

  return points;
}

function hasParsedReplay(entry: MatchHistoryEntry) {
  return Boolean(entry.match.replayUploads?.some((upload) => upload.status === "PARSED"));
}

export function Stats() {
  const { user } = useAuthStore();
  const [matches, setMatches] = useState<MatchHistoryEntry[]>([]);
  const [range, setRange] = useState<RangeFilter>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.username) return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    api
      .get<MatchHistoryEntry[]>(`/users/${user.username}/matches`)
      .then(({ data }) => {
        if (!cancelled) setMatches(data);
      })
      .catch((err) => {
        if (!cancelled) {
          setMatches([]);
          setError(err.response?.data?.error?.message ?? "No pude cargar tus estadísticas.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [user?.username]);

  const visibleMatches = useMemo(() => filterByRange(matches, range), [matches, range]);
  const completed = visibleMatches.filter(isCompleted);
  const wins = completed.filter(didWin).length;
  const losses = completed.length - wins;
  const wr = winrate(wins, losses);
  const deltas = completed
    .map((entry) => entry.mmrDelta)
    .filter((delta): delta is number => typeof delta === "number");
  const netElo = deltas.reduce((sum, delta) => sum + delta, 0);
  const avgDelta = deltas.length ? Math.round(netElo / deltas.length) : 0;
  const bestDelta = deltas.length ? Math.max(...deltas) : 0;
  const worstDelta = deltas.length ? Math.min(...deltas) : 0;
  const streak = currentStreak(visibleMatches);
  const mapStats = buildMapStats(visibleMatches);
  const recentForm = completed.slice(0, 10);
  const mmrTrend = buildMmrTrend(visibleMatches, user?.mmr ?? 0);
  const parsedReplayCount = completed.filter(hasParsedReplay).length;

  if (!user) return null;

  return (
    <div style={pageStyle}>
      <PageHeader
        eyebrow="Nexus analytics"
        title="Estadísticas competitivas"
        description="Historial, tendencia de MMR, forma reciente, mapas y evidencia por replay usando los datos reales que guarda el MVP."
        icon={<Activity size={18} />}
        actions={
          <div style={rangeRailStyle}>
            {[
              ["all", "Todo"],
              ["30d", "30 días"],
              ["7d", "7 días"],
            ].map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setRange(value as RangeFilter)}
                style={range === value ? activeRangeButtonStyle : rangeButtonStyle}
              >
                {label}
              </button>
            ))}
          </div>
        }
      />

      {error ? (
        <section style={errorStyle}>{error}</section>
      ) : null}

      <section style={metricGridStyle}>
        <MetricCard icon={Trophy} label="Winrate" value={`${wr}%`} detail={`${wins}W · ${losses}L`} tone={wr >= 50 ? "#4ade80" : "#f87171"} />
        <MetricCard icon={TrendingUp} label="ELO neto" value={`${netElo >= 0 ? "+" : ""}${netElo}`} detail={`Promedio ${avgDelta >= 0 ? "+" : ""}${avgDelta} por match`} tone={netElo >= 0 ? "#38bdf8" : "#f87171"} />
        <MetricCard icon={Activity} label="Racha actual" value={streak.label} detail="Según matches completados" tone={streak.tone} />
        <MetricCard icon={Swords} label="Matches" value={completed.length} detail={`${parsedReplayCount} con replay parseado`} tone="#c084fc" />
      </section>

      <section style={mainGridStyle}>
        <div style={{ display: "grid", gap: "1rem", minWidth: 0 }}>
          <Panel
            eyebrow="Historial detallado"
            title="Últimas partidas"
            subtitle="Datos reales actuales: mapa, resultado, team, delta ELO y estado."
          >
            {loading ? (
              <EmptyState text="Sincronizando tu historial competitivo..." />
            ) : visibleMatches.length === 0 ? (
              <EmptyState text="No hay partidas para este filtro. Cuando cierres una partida, este panel se llena solo con mapa, resultado y ELO." />
            ) : (
              <div style={historyListStyle}>
                {visibleMatches.map((entry) => {
                  const won = didWin(entry);
                  const completedMatch = isCompleted(entry);
                  const resultTone = !completedMatch ? "#94a3b8" : won ? "#4ade80" : "#f87171";
                  const delta = entry.mmrDelta ?? 0;
                  const mapImage = getMatchMapImage(entry.match.selectedMap);
                  const replayReady = hasParsedReplay(entry);

                  return (
                    <Link
                      key={entry.id}
                      to="/match/$matchId"
                      params={{ matchId: entry.match.id }}
                      style={{ ...historyRowStyle, borderColor: `${resultTone}36` }}
                    >
                      <div style={mapThumbStyle}>
                        {mapImage ? <img src={mapImage} alt="" loading="lazy" decoding="async" style={mapThumbImageStyle} /> : null}
                        <div style={mapThumbOverlayStyle} />
                      </div>

                      <div style={{ minWidth: 0 }}>
                        <div style={historyTitleStyle}>{entry.match.selectedMap ?? "Mapa pendiente"}</div>
                        <div style={historyMetaStyle}>
                          <span style={{ color: resultTone }}>{completedMatch ? (won ? "Victoria" : "Derrota") : entry.match.status}</span>
                          <span>Team {entry.team}</span>
                          <span>{formatRelative(entry.match.createdAt)}</span>
                          {replayReady ? <span style={replayPillStyle}>Replay</span> : null}
                        </div>
                      </div>

                      <div style={historySideStyle}>
                        <span style={deltaBadgeStyle(delta, completedMatch)}>
                          {completedMatch && entry.mmrDelta != null ? `${delta >= 0 ? "+" : ""}${delta} ELO` : "—"}
                        </span>
                        <span style={dateStyle}>{formatDate(entry.match.createdAt)}</span>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </Panel>
        </div>

        <aside style={{ display: "grid", gap: "1rem", minWidth: 0 }}>
          <Panel
            eyebrow="Tendencia MMR"
            title="Momentum competitivo"
            subtitle="Reconstrucción aproximada desde el MMR actual y los deltas de las últimas partidas."
          >
            {mmrTrend.length < 2 ? (
              <EmptyState text="Faltan partidas con delta ELO para dibujar tendencia." />
            ) : (
              <MmrTrendCard points={mmrTrend} netElo={netElo} />
            )}
          </Panel>

          <Panel
            eyebrow="Forma reciente"
            title="Últimos 10"
            subtitle="Lectura rápida tipo scouting."
          >
            {recentForm.length === 0 ? (
              <EmptyState text="Todavía no hay forma reciente; necesitás al menos una partida completada." />
            ) : (
              <div style={formRailStyle}>
                {recentForm.map((entry, index) => {
                  const won = didWin(entry);
                  return (
                    <span
                      key={`${entry.id}-${index}`}
                      title={`${won ? "Victoria" : "Derrota"} · ${entry.match.selectedMap ?? "Mapa"}`}
                      style={formBoxStyle(won)}
                    >
                      {won ? "W" : "L"}
                    </span>
                  );
                })}
              </div>
            )}
          </Panel>

          <Panel
            eyebrow="Map pool"
            title="Mapas más jugados"
            subtitle="Con el MVP actual sólo podemos medir mapa/resultado."
          >
            {mapStats.length === 0 ? (
              <EmptyState text="Sin mapas consolidados en este rango. El map pool aparece apenas haya resultados cerrados." />
            ) : (
              <div style={{ display: "grid", gap: "0.6rem" }}>
                {mapStats.map((map) => (
                  <div key={map.name} style={mapStatRowStyle}>
                    <div style={{ minWidth: 0 }}>
                      <div style={mapNameStyle}>{map.name}</div>
                      <div style={tinyMetaStyle}>{map.wins}W · {map.losses}L · {map.played} jugadas</div>
                    </div>
                    <strong style={{ color: map.winrate >= 50 ? "#4ade80" : "#f87171" }}>{map.winrate}%</strong>
                  </div>
                ))}
              </div>
            )}
          </Panel>

          <Panel
            eyebrow="Próximo upgrade"
            title="Stats a enriquecer"
            subtitle="La base ya usa historial y replays; el siguiente paso es convertir señales individuales en tendencias persistentes."
          >
            <div style={dataSlotsStyle}>
              <DataSlot icon={Crosshair} label="Héroes" value="pool personal en Hero Lab" />
              <DataSlot icon={Clock3} label="Duración" value="promedios por mapa" />
              <DataSlot icon={Database} label="Combate" value="KDA, daño y presencia" />
              <DataSlot icon={MapIcon} label="Mapa" value="objetivos y draft por mapa" />
            </div>
          </Panel>
        </aside>
      </section>

      <section style={eloBandStyle}>
        <div>
          <div style={eyebrowStyle}>Rango de variación</div>
          <strong style={{ color: "#e2e8f0" }}>Mejor {bestDelta >= 0 ? "+" : ""}{bestDelta} · Peor {worstDelta >= 0 ? "+" : ""}{worstDelta}</strong>
        </div>
        <div style={eloTrackStyle}>
          <span style={{ ...eloTrackFillStyle, width: `${Math.min(100, Math.max(0, 50 + netElo))}%` }} />
        </div>
      </section>
    </div>
  );
}

function Panel({ eyebrow, title, subtitle, children }: { eyebrow: string; title: string; subtitle: string; children: ReactNode }) {
  return (
    <section style={panelStyle}>
      <div>
        <div style={eyebrowStyle}>{eyebrow}</div>
        <div style={panelTitleStyle}>{title}</div>
        <div style={panelSubtitleStyle}>{subtitle}</div>
      </div>
      {children}
    </section>
  );
}

function MetricCard({ icon: Icon, label, value, detail, tone }: { icon: typeof Trophy; label: string; value: string | number; detail: string; tone: string }) {
  return (
    <div style={{ ...metricCardStyle, borderColor: `${tone}36` }}>
      <div style={metricHeaderStyle}>
        <span>{label}</span>
        <Icon size={16} color={tone} />
      </div>
      <div style={{ ...metricValueStyle, color: tone }}>{value}</div>
      <div style={panelSubtitleStyle}>{detail}</div>
    </div>
  );
}

function DataSlot({ icon: Icon, label, value }: { icon: typeof Crosshair; label: string; value: string }) {
  return (
    <div style={dataSlotStyle}>
      <Icon size={15} color="#7dd3fc" />
      <span>{label}</span>
      <small>{value}</small>
    </div>
  );
}

function MmrTrendCard({ points, netElo }: { points: Array<{ label: string; value: number }>; netElo: number }) {
  const values = points.map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(1, max - min);
  const width = 260;
  const height = 92;
  const coordinates = points.map((point, index) => {
    const x = points.length === 1 ? width : (index / (points.length - 1)) * width;
    const y = height - ((point.value - min) / span) * height;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const last = points.at(-1);

  return (
    <div style={trendCardStyle}>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Tendencia de MMR" style={trendSvgStyle}>
        <polyline points={coordinates.join(" ")} fill="none" stroke={netElo >= 0 ? "#4ade80" : "#f87171"} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
        <polygon points={`0,${height} ${coordinates.join(" ")} ${width},${height}`} fill={netElo >= 0 ? "rgba(74,222,128,0.10)" : "rgba(248,113,113,0.10)"} stroke="none" />
      </svg>
      <div style={trendFooterStyle}>
        <span>Floor {min}</span>
        <strong>{last?.value ?? 0} MMR</strong>
        <span>Peak {max}</span>
      </div>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return <div style={emptyStyle}>{text}</div>;
}

const pageStyle: CSSProperties = { display: "grid", gap: "1rem" };
const eyebrowStyle: CSSProperties = { color: "#00c8ff", fontSize: "0.68rem", fontWeight: 900, letterSpacing: "0.18em", textTransform: "uppercase" };
const rangeRailStyle: CSSProperties = { display: "flex", gap: "0.45rem", flexWrap: "wrap" };
const rangeButtonStyle: CSSProperties = { border: "1px solid rgba(148,163,184,0.16)", background: "rgba(2,6,23,0.58)", color: "rgba(226,232,240,0.72)", padding: "0.6rem 0.75rem", cursor: "pointer", fontWeight: 900, letterSpacing: "0.1em", textTransform: "uppercase" };
const activeRangeButtonStyle: CSSProperties = { ...rangeButtonStyle, border: "1px solid rgba(0,200,255,0.38)", background: "rgba(0,200,255,0.14)", color: "#bae6fd" };
const errorStyle: CSSProperties = { border: "1px solid rgba(248,113,113,0.26)", background: "rgba(127,29,29,0.14)", color: "#fecaca", padding: "0.85rem 1rem" };
const metricGridStyle: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "0.8rem" };
const metricCardStyle: CSSProperties = { border: "1px solid rgba(148,163,184,0.12)", background: "rgba(5,10,18,0.86)", padding: "0.9rem", display: "grid", gap: "0.45rem" };
const metricHeaderStyle: CSSProperties = { display: "flex", justifyContent: "space-between", gap: "0.7rem", color: "rgba(226,232,240,0.7)", fontSize: "0.68rem", fontWeight: 900, letterSpacing: "0.14em", textTransform: "uppercase" };
const metricValueStyle: CSSProperties = { fontFamily: "var(--font-display)", fontSize: "1.8rem", fontWeight: 900, letterSpacing: "0.05em" };
const mainGridStyle: CSSProperties = { display: "grid", gridTemplateColumns: "minmax(0, 1.35fr) minmax(300px, 0.65fr)", gap: "1rem", alignItems: "start" };
const panelStyle: CSSProperties = { minWidth: 0, border: "1px solid rgba(148,163,184,0.12)", background: "rgba(4,9,16,0.88)", padding: "1rem", display: "grid", gap: "0.85rem" };
const panelTitleStyle: CSSProperties = { marginTop: "0.15rem", color: "#f8fafc", fontFamily: "var(--font-display)", fontSize: "1rem", fontWeight: 900, letterSpacing: "0.08em", textTransform: "uppercase" };
const panelSubtitleStyle: CSSProperties = { color: "rgba(148,163,184,0.82)", fontSize: "0.82rem", lineHeight: 1.45 };
const historyListStyle: CSSProperties = { display: "grid", gap: "0.58rem" };
const historyRowStyle: CSSProperties = { display: "grid", gridTemplateColumns: "76px minmax(0, 1fr) auto", alignItems: "center", gap: "0.75rem", minHeight: "68px", padding: "0.5rem 0.65rem 0.5rem 0.5rem", border: "1px solid", background: "rgba(15,23,42,0.44)", color: "inherit", textDecoration: "none" };
const mapThumbStyle: CSSProperties = { position: "relative", width: "72px", height: "48px", overflow: "hidden", border: "1px solid rgba(148,163,184,0.14)", background: "rgba(2,6,23,0.8)" };
const mapThumbImageStyle: CSSProperties = { width: "100%", height: "100%", objectFit: "cover", display: "block", filter: "brightness(0.72)" };
const mapThumbOverlayStyle: CSSProperties = { position: "absolute", inset: 0, background: "linear-gradient(135deg, rgba(255,255,255,0.08), transparent 42%, rgba(0,0,0,0.38))" };
const historyTitleStyle: CSSProperties = { color: "#f8fafc", fontWeight: 900, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" };
const historyMetaStyle: CSSProperties = { marginTop: "0.2rem", display: "flex", gap: "0.6rem", flexWrap: "wrap", alignItems: "center", color: "rgba(148,163,184,0.78)", fontSize: "0.76rem", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em" };
const replayPillStyle: CSSProperties = { border: "1px solid rgba(125,211,252,0.28)", background: "rgba(14,116,144,0.16)", color: "#7dd3fc", padding: "0.1rem 0.35rem", fontSize: "0.62rem" };
const historySideStyle: CSSProperties = { display: "grid", justifyItems: "end", gap: "0.2rem", whiteSpace: "nowrap" };
const dateStyle: CSSProperties = { color: "rgba(148,163,184,0.62)", fontSize: "0.72rem" };
function deltaBadgeStyle(delta: number, completed: boolean): CSSProperties { const tone = !completed ? "#94a3b8" : delta >= 0 ? "#4ade80" : "#f87171"; return { minWidth: "78px", textAlign: "center", border: `1px solid ${tone}44`, background: `${tone}14`, color: tone, padding: "0.25rem 0.45rem", fontSize: "0.68rem", fontWeight: 900, letterSpacing: "0.08em" }; }
const formRailStyle: CSSProperties = { display: "flex", gap: "0.35rem", flexWrap: "wrap" };
function formBoxStyle(won: boolean): CSSProperties { const tone = won ? "#4ade80" : "#f87171"; return { width: "34px", height: "34px", display: "grid", placeItems: "center", border: `1px solid ${tone}66`, background: `${tone}18`, color: tone, fontWeight: 950 }; }
const mapStatRowStyle: CSSProperties = { display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: "0.75rem", alignItems: "center", padding: "0.7rem", border: "1px solid rgba(148,163,184,0.12)", background: "rgba(15,23,42,0.38)" };
const mapNameStyle: CSSProperties = { color: "#e2e8f0", fontWeight: 900, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" };
const tinyMetaStyle: CSSProperties = { marginTop: "0.15rem", color: "rgba(148,163,184,0.72)", fontSize: "0.75rem" };
const dataSlotsStyle: CSSProperties = { display: "grid", gap: "0.55rem" };
const trendCardStyle: CSSProperties = { display: "grid", gap: "0.55rem", border: "1px solid rgba(148,163,184,0.12)", background: "radial-gradient(circle at 20% 0%, rgba(56,189,248,0.16), transparent 34%), rgba(2,6,23,0.35)", padding: "0.75rem" };
const trendSvgStyle: CSSProperties = { width: "100%", height: "112px", overflow: "visible", filter: "drop-shadow(0 0 14px rgba(56,189,248,0.18))" };
const trendFooterStyle: CSSProperties = { display: "flex", justifyContent: "space-between", gap: "0.75rem", color: "rgba(148,163,184,0.78)", fontSize: "0.72rem", textTransform: "uppercase", letterSpacing: "0.08em" };
const dataSlotStyle: CSSProperties = { display: "grid", gridTemplateColumns: "auto 0.7fr 1.3fr", alignItems: "center", gap: "0.5rem", color: "rgba(226,232,240,0.72)", fontSize: "0.8rem", border: "1px solid rgba(125,211,252,0.10)", background: "rgba(14,116,144,0.08)", padding: "0.55rem" };
const emptyStyle: CSSProperties = { border: "1px dashed rgba(148,163,184,0.18)", background: "rgba(2,6,23,0.35)", color: "rgba(148,163,184,0.78)", padding: "1rem", textAlign: "center", fontWeight: 800 };
const eloBandStyle: CSSProperties = { display: "grid", gap: "0.6rem", border: "1px solid rgba(125,211,252,0.14)", background: "rgba(8,20,34,0.38)", padding: "0.9rem" };
const eloTrackStyle: CSSProperties = { height: "8px", overflow: "hidden", border: "1px solid rgba(148,163,184,0.14)", background: "linear-gradient(90deg, rgba(248,113,113,0.18), rgba(148,163,184,0.12) 50%, rgba(74,222,128,0.18))" };
const eloTrackFillStyle: CSSProperties = { display: "block", height: "100%", background: "linear-gradient(90deg, #38bdf8, #4ade80)", boxShadow: "0 0 18px rgba(56,189,248,0.35)" };

