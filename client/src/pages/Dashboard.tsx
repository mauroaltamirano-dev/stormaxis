import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { Activity, ArrowRight, Clock3, Loader2, Shield, Swords, Timer, Users, X } from "lucide-react";
import { MAP_ID_BY_NAME } from "@nexusgg/shared";
import { CountryBadge } from "../components/CountryBadge";
import { PlayerLink } from "../components/PlayerLink";
import { api } from "../lib/api";
import { getSocket } from "../lib/socket";
import { reportClientError } from "../lib/monitoring";
import { getRankMeta, getRankMetaFromMmr, parseRankLevel } from "../lib/ranks";
import { getRoleMeta } from "../lib/roles";
import { useAuthStore } from "../stores/auth.store";
import { useMatchmakingStore } from "../stores/matchmaking.store";

type LiveMatchRow = {
  id: string;
  status: "VETOING" | "PLAYING" | "VOTING";
  mode: string;
  region: string;
  selectedMap: string | null;
  scrimDetails?: {
    team1Name: string;
    team2Name: string;
  } | null;
  createdAt: string;
  startedAt?: string | null;
  readyCount: number;
  totalPlayers: number;
  teams: Record<1 | 2, Array<{ mmr: number; rank?: string | null; isBot?: boolean }>>;
};


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
      parsedSummary?: {
        players?: Array<{
          name?: string | null;
          battleTag?: string | null;
          hero?: string | null;
          team?: 1 | 2 | null;
        }>;
      } | null;
    }>;
  };
};

type DisplayMatchRow = {
  id: string;
  selectedMap: string;
  modeLabel: string;
  avgMmr: number;
  team1Rank: string;
  team2Rank: string;
  team1RankIconSrc: string;
  team2RankIconSrc: string;
  time: string;
  statusLabel: string;
  connected: string;
};

type QueuePlayer = {
  userId: string;
  username: string;
  avatar: string | null;
  countryCode?: string | null;
  mmr: number;
  joinedAt: number | null;
  roles?: string[];
  isBot?: boolean;
};

type PendingMatchPayload = NonNullable<ReturnType<typeof useMatchmakingStore.getState>["pendingMatch"]>;

type QueueRequestError = { response?: { data?: { error?: { message?: string } } } };

const MODES = [
  { key: "COMPETITIVE", label: "Competitivo 5v5", icon: "⬟", enabled: true },
] as const;

export function Dashboard() {
  const navigate = useNavigate();
  const { user, updateUser } = useAuthStore();
  const {
    status,
    searchStartedAt,
    pendingMatch,
    queueSize,
    queueEtaSeconds,
    startSearching,
    stopSearching,
    setMatchFound,
    resetMatchmaking,
    setQueueSize,
    setQueueProgress,
    activeMatchId,
  } = useMatchmakingStore();

  const [selectedMode, setSelectedMode] = useState("COMPETITIVE");
  const [elapsed, setElapsed] = useState(0);
  const [queuePreview, setQueuePreview] = useState<QueuePlayer[]>([]);
  const [liveMatches, setLiveMatches] = useState<LiveMatchRow[]>([]);
  const [matchHistory, setMatchHistory] = useState<MatchHistoryEntry[]>([]);

  useEffect(() => {
    if (status !== "searching" || !searchStartedAt) return;
    const tick = () => setElapsed(Math.max(0, Math.floor((Date.now() - searchStartedAt) / 1000)));
    tick();
    const interval = window.setInterval(tick, 1000);
    return () => window.clearInterval(interval);
  }, [status, searchStartedAt]);

  useEffect(() => {
    const socket = getSocket();
    const onMatchFound = (payload: PendingMatchPayload) => setMatchFound(payload);
    const onCancelled = () => resetMatchmaking();
    const onQueueUpdate = (payload: { position?: number; etaSeconds?: number; queueSize?: number }) => {
      if (typeof payload.queueSize === "number") setQueueSize(payload.queueSize);
      setQueueProgress({ position: payload.position, etaSeconds: payload.etaSeconds });
    };
    const onUserEloUpdate = (data: { newMMR: number; newRank: string }) => updateUser({ mmr: data.newMMR, rank: data.newRank });

    socket.on("matchmaking:found", onMatchFound);
    socket.on("matchmaking:cancelled", onCancelled);
    socket.on("matchmaking:queue_update", onQueueUpdate);
    socket.on("matchmaking:queue_public_update", onQueueUpdate);
    socket.on("user:elo_update", onUserEloUpdate);
    return () => {
      socket.off("matchmaking:found", onMatchFound);
      socket.off("matchmaking:cancelled", onCancelled);
      socket.off("matchmaking:queue_update", onQueueUpdate);
      socket.off("matchmaking:queue_public_update", onQueueUpdate);
      socket.off("user:elo_update", onUserEloUpdate);
    };
  }, [resetMatchmaking, setMatchFound, setQueueProgress, setQueueSize, updateUser]);

  useEffect(() => {
    api.get<{ inQueue: boolean; queueSize?: number; mode?: string; joinedAt?: number }>("/matchmaking/queue/status")
      .then(({ data }) => {
        if (!data.inQueue) return;
        if (data.mode) setSelectedMode(data.mode);
        if (typeof data.queueSize === "number") setQueueSize(data.queueSize);
        startSearching(data.joinedAt);
      })
      .catch(() => {});
  }, [setQueueSize, startSearching]);

  useEffect(() => {
    let cancelled = false;
    async function loadQueueSnapshot() {
      try {
        const { data } = await api.get<{ count: number; players: QueuePlayer[] }>("/matchmaking/queue/snapshot");
        if (cancelled) return;
        setQueuePreview(data.players);
        setQueueSize(data.count);
        if (user?.id) {
          const position = data.players.findIndex((entry) => entry.userId === user.id);
          if (position >= 0) setQueueProgress({ position: position + 1 });
        }
      } catch {
        if (!cancelled) setQueuePreview([]);
      }
    }
    loadQueueSnapshot();
    const interval = window.setInterval(loadQueueSnapshot, 5000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [setQueueProgress, setQueueSize, user?.id]);

  useEffect(() => {
    let cancelled = false;
    async function loadLiveMatches() {
      try {
        const { data } = await api.get<LiveMatchRow[]>("/matches/live");
        if (!cancelled) setLiveMatches(data);
      } catch {
        if (!cancelled) setLiveMatches([]);
      }
    }
    loadLiveMatches();
    const interval = window.setInterval(loadLiveMatches, 8000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    if (!user?.username) return;
    let cancelled = false;
    api.get<MatchHistoryEntry[]>(`/users/${encodeURIComponent(user.username)}/matches`)
      .then(({ data }) => {
        if (!cancelled) setMatchHistory(data);
      })
      .catch(() => {
        if (!cancelled) setMatchHistory([]);
      });
    return () => {
      cancelled = true;
    };
  }, [user?.username]);

  async function handleFindMatch() {
    if (pendingMatch) return;
    if (activeMatchId) {
      navigate({ to: "/match/$matchId", params: { matchId: activeMatchId } });
      return;
    }

    const leaveCurrentQueue = async () => {
      await api.post("/matchmaking/queue/leave").catch((err) => reportClientError(err, "dashboard.queue.leave"));
      stopSearching();
    };

    if (status === "searching") {
      await leaveCurrentQueue();
      return;
    }

    try {
      const { data: queueStatus } = await api.get<{ inQueue: boolean; queueSize?: number; mode?: string; joinedAt?: number }>("/matchmaking/queue/status");
      if (queueStatus.inQueue) {
        await leaveCurrentQueue();
        return;
      }

      await api.post("/matchmaking/queue/join", { mode: selectedMode });
      startSearching();
    } catch (err: unknown) {
      reportClientError(err, "dashboard.queue.join");
      const queueError = err as QueueRequestError;
      const message = queueError.response?.data?.error?.message;
      if (message === "Already in queue") {
        await leaveCurrentQueue();
        return;
      }
      if (message === "Cannot join queue while selected in an open scrim search") {
        window.alert("Estás seleccionado en una búsqueda de scrim activa. Cancela la scrim o pide al captain que te quite antes de buscar partida.");
        return;
      }
      window.alert(message ?? "No se pudo entrar a cola.");
    }
  }

  if (!user) return null;

  const rankMeta = getRankMeta(user.level ?? parseRankLevel(user.rank));
  const totalPlayed = user.wins + user.losses;
  const winrate = totalPlayed > 0 ? Math.round((user.wins / totalPlayed) * 100) : 0;
  const streak = calculateCurrentStreak(matchHistory);
  const streakAsset = streak.value < 0 ? "/brand/lossStreak.webp" : "/brand/winStreak.webp";
  const displayedQueue = queueSize ?? queuePreview.length;
  const searchElapsedLabel = formatClock(elapsed);
  const displayedEta = status === "searching" ? searchElapsedLabel : queueEtaSeconds != null ? formatClock(queueEtaSeconds) : "—";
  const displayedLiveCount = liveMatches.length;
  const activity = getActivityLabel(displayedQueue, displayedLiveCount);
  const roleRows = buildRoleRows(queuePreview);
  const matchesForDisplay = liveMatches.map(liveToDisplayRow);
  const searchingPlayers = queuePreview.filter((player) => !player.isBot);

  return (
    <>
      <section className="storm-dashboard-grid">
        <article className="storm-panel storm-hero">
          <div className="storm-hero-scene" />
          <div className="storm-hero-content">
            <div className="storm-eyebrow">Sudamérica · Beta competitiva</div>
            <h1 className="storm-hero-title">Buscar partida</h1>
            <p className="storm-hero-subtitle">Únete a la batalla en el nexo</p>

            <div className="storm-mode-tabs" aria-label="Selector de modo">
              {MODES.map((mode) => (
                <button key={mode.key} type="button" disabled={!mode.enabled || status === "searching" || Boolean(activeMatchId)} onClick={() => setSelectedMode(mode.key)} className={`storm-mode-tab${selectedMode === mode.key ? " active" : ""}`}>
                  <Shield size={16} /> {mode.label}
                </button>
              ))}
            </div>

            <div className="storm-cta-wrap">
              <button
                className={[
                  "storm-cta",
                  status === "searching" ? "searching" : "",
                  pendingMatch ? "confirming" : "",
                  activeMatchId && status !== "searching" && !pendingMatch ? "active-match" : "",
                ].filter(Boolean).join(" ")}
                type="button"
                onClick={handleFindMatch}
                disabled={Boolean(pendingMatch)}
              >
                <span className="storm-cta-content">
                  <span className="storm-cta-ico" aria-hidden="true">
                    {pendingMatch
                      ? <Loader2 size={24} className="storm-cta-spin" />
                      : activeMatchId
                      ? <ArrowRight size={24} />
                      : status === "searching"
                      ? <X size={22} />
                      : <Swords size={24} />}
                  </span>
                  <span className="storm-cta-text">
                    {pendingMatch
                      ? "Confirmando partida"
                      : activeMatchId
                      ? "Ir al matchroom"
                      : status === "searching"
                      ? `Cancelar · ${searchElapsedLabel}`
                      : "Encontrar partida"}
                  </span>
                </span>
                <span className="storm-cta-shimmer" aria-hidden="true" />
              </button>
            </div>

            {status === "searching" && (
              <div className="storm-queue-bar" role="status" aria-live="polite">
                <span className="storm-queue-bar-dot" aria-hidden="true" />
                <span className="storm-queue-bar-group">
                  <span className="storm-queue-bar-label">En cola</span>
                  <strong className="storm-queue-bar-val">Buscando</strong>
                </span>
                <span className="storm-queue-bar-sep" aria-hidden="true" />
                <span className="storm-queue-bar-group">
                  <span className="storm-queue-bar-label">Tiempo estimado</span>
                  <strong className="storm-queue-bar-val">
                    <Timer size={13} style={{ verticalAlign: "middle", marginRight: 4 }} />
                    {displayedEta}
                  </strong>
                </span>
                <span className="storm-queue-bar-sep" aria-hidden="true" />
                <span className="storm-queue-bar-group">
                  <span className="storm-queue-bar-label">Jugadores</span>
                  <strong className="storm-queue-bar-val">{displayedQueue}</strong>
                </span>
              </div>
            )}

            <div className="storm-mini-stats" aria-label="Resumen del jugador">
              <div className="storm-stat-card"><div className="storm-stat-icon"><img src="/brand/winrate.webp" alt="" /></div><div><div className="storm-stat-label">Winrate</div><div className="storm-stat-value">{winrate}%</div><div className="storm-stat-sub">{totalPlayed ? `${user.wins}W / ${user.losses}L` : "Sin partidas"}</div></div></div>
              <div className="storm-stat-card"><div className="storm-stat-icon purple"><img src={rankMeta.iconSrc} alt="" /></div><div><div className="storm-stat-label">MMR</div><div className="storm-stat-value">{user.mmr.toLocaleString("es-AR")}</div><div className="storm-stat-sub">{rankMeta.label}</div></div></div>
              <div className="storm-stat-card"><div className="storm-stat-icon"><img src="/brand/matches.webp" alt="" /></div><div><div className="storm-stat-label">Partidas</div><div className="storm-stat-value">{totalPlayed}</div><div className="storm-stat-sub">Persistidas</div></div></div>
              <div className="storm-stat-card"><div className="storm-stat-icon green"><img src={streakAsset} alt="" /></div><div><div className="storm-stat-label">Racha</div><div className="storm-stat-value">{streak.label}</div><div className="storm-stat-sub">{streak.detail}</div></div></div>
            </div>
          </div>
        </article>

        <aside className="storm-right-stack">
          <article className="storm-panel storm-live-panel">
            <div className="storm-panel-head"><h2 className="storm-panel-title">En vivo ahora</h2><span className="storm-panel-badge">Live</span></div>
            <div className="storm-live-list">
              <LiveMetric icon={<Users size={17} />} label="Jugadores en cola" value={`${displayedQueue}`} />
              <LiveMetric icon={<Clock3 size={17} />} label="Tiempo estimado" value={displayedEta} />
              <LiveMetric icon={<Swords size={17} />} label="Partidas en vivo" value={`${displayedLiveCount}`} />
              <LiveMetric icon={<Activity size={17} />} label="Pico de actividad" value={activity} highlight />
            </div>
            <Sparkline />
          </article>

          <article className="storm-panel storm-event-panel">
            <div className="storm-event-content"><div className="storm-event-label">Evento activo</div><div className="storm-event-title">Fase Beta Cerrada</div><div className="storm-event-copy">Estamos validando matchmaking competitivo y scrims en tiempo real.</div><div className="storm-event-time"><Clock3 size={14} /> Feedback abierto en Discord</div></div><div className="storm-loot" aria-hidden="true" />
          </article>
        </aside>

        <article className="storm-panel storm-live-matches">
          <div className="storm-panel-head"><h2 className="storm-panel-title">Partidas en vivo</h2><span className="storm-panel-badge">Click en una fila</span></div>
          <div className="storm-table-wrap"><table className="storm-table"><thead><tr><th>Mapa</th><th>Rango vs rango</th><th>MMR prom.</th><th>Tiempo</th><th>Estado</th><th>Conectados</th></tr></thead><tbody>
            {matchesForDisplay.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ padding: "18px", textAlign: "center", color: "rgba(170,189,230,.72)" }}>
                  No hay partidas en vivo ahora. Aparecen desde veto hasta finalización/cancelación.
                </td>
              </tr>
            ) : matchesForDisplay.map((match) => (
              <tr key={match.id} onClick={() => navigate({ to: "/match/$matchId", params: { matchId: match.id } })} style={{ cursor: "pointer" }}>
                <td><div className="storm-map-cell"><MapThumb mapName={match.selectedMap} /><div><div className="storm-map-name">{match.selectedMap}</div><div className="storm-map-mode">{match.modeLabel}</div></div></div></td>
                <td><span className="storm-versus"><span className="storm-team-rank" title={match.team1Rank} aria-label={match.team1Rank}><img src={match.team1RankIconSrc} alt="" /></span> VS <span className="storm-team-rank red" title={match.team2Rank} aria-label={match.team2Rank}><img src={match.team2RankIconSrc} alt="" /></span></span></td>
                <td>{match.avgMmr.toLocaleString("es-AR")}</td><td>{match.time}</td><td><span className="storm-state">{match.statusLabel}</span></td><td><span className="storm-viewers"><Users size={14} /> {match.connected}</span></td>
              </tr>
            ))}
          </tbody></table></div>
          <p className="storm-table-note">Solo mostramos partidas reales activas. Abrí cualquier fila para ir a su matchroom.</p>
        </article>

        <aside className="storm-aside-grid">
          <article className="storm-panel storm-queue-panel">
            <div className="storm-panel-head"><h2 className="storm-panel-title">Cola en tiempo real</h2><span className="storm-panel-badge">Por rol</span></div>
            <div className="storm-queue-list">
              {roleRows.map((row) => <QueueRoleRow key={row.label} row={row} />)}
            </div>
            <div className="storm-queue-footer">Total en cola: {displayedQueue} jugadores</div>
          </article>

          <article className="storm-panel storm-server-panel">
            <div className="storm-panel-head"><h2 className="storm-panel-title">Jugadores buscando partida</h2><span className="storm-panel-badge">{searchingPlayers.length}</span></div>
            <div className="storm-searching-players" aria-label="Jugadores buscando partida">
              {searchingPlayers.length === 0 ? (
                <div className="storm-searching-empty">No hay jugadores reales buscando en este momento.</div>
              ) : (
                <div className="storm-searching-list">
                  {searchingPlayers.map((player) => (
                    <QueuePlayerRow key={player.userId} player={player} />
                  ))}
                </div>
              )}
            </div>
          </article>
        </aside>
      </section>
    </>
  );
}

function QueuePlayerRow({ player }: { player: QueuePlayer }) {
  const rankMeta = getRankMetaFromMmr(player.mmr);
  return (
    <div className="storm-searching-player-row">
      <div className={`storm-avatar storm-avatar--queue${player.avatar ? "" : " empty"}`}>
        {player.avatar ? <img src={player.avatar} alt={player.username} /> : null}
      </div>
      <div className="storm-searching-player-copy">
        <div className="storm-searching-player-name">
          <PlayerLink username={player.username}>{player.username}</PlayerLink>
        </div>
        <div className="storm-searching-player-meta">
          <CountryBadge countryCode={player.countryCode} compact />
          <span>{player.mmr.toLocaleString("es-AR")} MMR</span>
        </div>
      </div>
      <div className="storm-searching-rank" title={rankMeta.label} aria-label={rankMeta.label}>
        <img src={rankMeta.iconSrc} alt="" />
        <span>{rankMeta.label}</span>
      </div>
    </div>
  );
}


function LiveMetric({ icon, label, value, highlight }: { icon: ReactNode; label: string; value: string; highlight?: boolean }) {
  return <div className="storm-live-row"><span className="storm-row-icon">{icon}</span><span>{label}</span><strong className={highlight ? "highlight" : undefined}>{value}</strong></div>;
}
function Sparkline() { return <div className="storm-sparkline" aria-hidden="true"><svg viewBox="0 0 360 80" preserveAspectRatio="none"><defs><linearGradient id="lineGradient" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#277cff" /><stop offset="0.45" stopColor="#9b55ff" /><stop offset="1" stopColor="#37d9ff" /></linearGradient><linearGradient id="fillGradient" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#9b55ff" stopOpacity="0.32" /><stop offset="1" stopColor="#37d9ff" stopOpacity="0" /></linearGradient></defs><path d="M0 62 L24 58 L42 60 L58 54 L76 55 L94 48 L110 50 L130 42 L148 47 L166 36 L184 41 L202 38 L220 43 L238 39 L258 41 L278 36 L294 39 L310 31 L330 34 L360 24 L360 80 L0 80 Z" fill="url(#fillGradient)" /><path d="M0 62 L24 58 L42 60 L58 54 L76 55 L94 48 L110 50 L130 42 L148 47 L166 36 L184 41 L202 38 L220 43 L238 39 L258 41 L278 36 L294 39 L310 31 L330 34 L360 24" fill="none" stroke="url(#lineGradient)" strokeWidth="3" strokeLinecap="round" /></svg><span className="storm-pulse-dot" /></div>; }
function MapThumb({ mapName }: { mapName: string }) { const mapId = MAP_ID_BY_NAME[mapName]; return mapId ? <img className="storm-map-thumb" src={`/maps/${mapId}.webp`} alt="" /> : <span className="storm-map-thumb" />; }
function QueueRoleRow({ row }: { row: { icon: string; label: string; count: number; percent: number; cyan?: boolean } }) { return <div className="storm-queue-row"><span className="storm-role-icon">{row.icon}</span><span>{row.label}</span><strong>{row.count}</strong><div className={`storm-bar${row.cyan ? " cyan" : ""}`}><span style={{ width: `${Math.max(4, row.percent)}%` }} /></div><span className="storm-percent">{row.percent}%</span></div>; }

function buildRoleRows(players: QueuePlayer[]) {
  const roles = [
    { role: "TANK", icon: "⬟", label: "Guerrero" },
    { role: "RANGED", icon: "⚔", label: "Asesino" },
    { role: "HEALER", icon: "✚", label: "Apoyo", cyan: true },
    { role: "OFFLANE", icon: "✦", label: "Especialista", cyan: true },
    { role: "FLEX", icon: "◎", label: "Flex", cyan: true },
  ];
  const counts = roles.map((entry) => ({
    ...entry,
    count: players.filter((p) => !p.isBot && (p.roles ?? []).includes(entry.role)).length,
  }));
  const total = Math.max(1, counts.reduce((sum, row) => sum + row.count, 0));
  return counts.map((entry) => ({
    icon: entry.icon,
    label: getRoleMeta(entry.role)?.label === "Tank" ? entry.label : entry.label,
    count: entry.count,
    percent: entry.count > 0 ? Math.round((entry.count / total) * 100) : 0,
    cyan: entry.cyan,
  }));
}

function liveToDisplayRow(match: LiveMatchRow): DisplayMatchRow {
  const team1Avg = averageMmr(match.teams[1] ?? []);
  const team2Avg = averageMmr(match.teams[2] ?? []);
  const team1Rank = resolveTeamRankMeta(match.teams[1] ?? [], team1Avg);
  const team2Rank = resolveTeamRankMeta(match.teams[2] ?? [], team2Avg);
  const players = [...(match.teams[1] ?? []), ...(match.teams[2] ?? [])];
  const realPlayers = players.filter((p) => !p.isBot);
  const avgMmr = realPlayers.length ? Math.round(realPlayers.reduce((sum, p) => sum + p.mmr, 0) / realPlayers.length) : 0;
  return {
    id: match.id,
    selectedMap: match.selectedMap ?? "Mapa pendiente",
    modeLabel: getModeLabel(match),
    avgMmr,
    team1Rank: team1Avg > 0 ? team1Rank.label : "Sin rango",
    team2Rank: team2Avg > 0 ? team2Rank.label : "Sin rango",
    team1RankIconSrc: team1Rank.iconSrc,
    team2RankIconSrc: team2Rank.iconSrc,
    time: formatRelativeMatchTime(match.startedAt, match.createdAt),
    statusLabel: getMatchStatusLabel(match.status),
    connected: `${Math.max(match.readyCount, match.totalPlayers)}/${match.totalPlayers || players.length || 10}`,
  };
}

function getModeLabel(match: LiveMatchRow) {
  if (match.mode === "TEAM" || match.scrimDetails) return "SCRIM";
  return "Competitivo 5v5";
}

function averageMmr(players: Array<{ mmr: number; isBot?: boolean }>) {
  const realPlayers = players.filter((player) => !player.isBot);
  if (!realPlayers.length) return 0;
  return Math.round(realPlayers.reduce((sum, player) => sum + player.mmr, 0) / realPlayers.length);
}

function resolveTeamRankMeta(players: Array<{ mmr: number; rank?: string | null; isBot?: boolean }>, fallbackAvgMmr: number) {
  const realPlayers = players.filter((player) => !player.isBot);
  const rankedLevels = realPlayers
    .map((player) => parseRankLevel(player.rank ?? null, 0))
    .filter((level) => level >= 1 && level <= 10);

  if (rankedLevels.length) {
    const roundedLevel = Math.max(1, Math.min(10, Math.round(rankedLevels.reduce((sum, level) => sum + level, 0) / rankedLevels.length)));
    return getRankMeta(roundedLevel);
  }
  return fallbackAvgMmr > 0 ? getRankMetaFromMmr(fallbackAvgMmr) : getRankMeta(1);
}

function calculateCurrentStreak(matches: MatchHistoryEntry[]) {
  const completed = matches.filter((entry) => entry.match.winner === 1 || entry.match.winner === 2);
  if (!completed.length) return { value: 0, label: "—", detail: "Sin historial" };

  const firstWon = completed[0].match.winner === completed[0].team;
  let count = 0;
  for (const entry of completed) {
    const won = entry.match.winner === entry.team;
    if (won !== firstWon) break;
    count += 1;
  }

  if (firstWon) return { value: count, label: `+${count}`, detail: `${count} victoria${count === 1 ? "" : "s"}` };
  return { value: -count, label: `-${count}`, detail: `${count} derrota${count === 1 ? "" : "s"}` };
}

function getActivityLabel(queueCount: number, liveCount: number) {
  const activityScore = queueCount + liveCount * 10;
  if (activityScore >= 20) return "Alto";
  if (activityScore >= 8) return "Medio";
  if (activityScore > 0) return "Bajo";
  return "Sin actividad";
}

function getMatchStatusLabel(status: LiveMatchRow["status"]) {
  switch (status) {
    case "VETOING":
      return "Veto";
    case "VOTING":
      return "Votación";
    case "PLAYING":
      return "En progreso";
  }
}

function formatClock(seconds: number) { const m = Math.floor(seconds / 60).toString().padStart(2, "0"); const s = (seconds % 60).toString().padStart(2, "0"); return `${m}:${s}`; }
function formatRelativeMatchTime(startedAt?: string | null, createdAt?: string) { const source = startedAt ?? createdAt; if (!source) return "—"; return formatClock(Math.max(0, Math.floor((Date.now() - new Date(source).getTime()) / 1000))); }
