import type { CSSProperties, ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  AlertTriangle,
  Bot,
  Clock3,
  Cpu,
  Gauge,
  RefreshCw,
  Shield,
  ShieldAlert,
  Swords,
  Users,
} from "lucide-react";
import { api } from "../lib/api";
import { useAuthStore } from "../stores/auth.store";
import { PageHeader } from "../components/PageHeader";

type AdminStats = {
  totalUsers: number;
  suspectUsers?: number;
  activeMatches: number;
  completedMatches: number;
  playersInQueue: number;
};

type QueuePlayer = {
  userId: string;
  username?: string | null;
  mmr: number;
  rank: string;
  joinedAt?: number | null;
  isBot?: boolean;
  roles?: string[];
};

type QueueResponse = {
  count: number;
  players: QueuePlayer[];
};

type MatchmakingMetrics = {
  region: string;
  status: "waiting_for_players" | "ready" | "force_relax_ready" | "blocked_by_spread";
  config: {
    matchSize: number;
    baseMmrTolerance: number;
    maxMmrTolerance: number;
    toleranceStep: number;
    toleranceStepSeconds: number;
    forceRelaxAfterSeconds: number;
    smallPopulationQueueLimit: number;
    ignoreMmrBalance: boolean;
  };
  queue: {
    total: number;
    humans: number;
    bots: number;
    missingPlayers: number;
    staleEntries: number;
    oldestWaitSeconds: number | null;
    averageWaitSeconds: number | null;
    medianWaitSeconds: number | null;
    p90WaitSeconds: number | null;
    mmrMin: number | null;
    mmrMax: number | null;
    mmrSpread: number | null;
    waitBands: {
      under30: number;
      under60: number;
      under120: number;
      over120: number;
    };
  };
  eta: {
    cycleSeconds: number;
    secondsPerPlayer: number;
    estimatedFillSeconds: number;
    recentCycleMedianSeconds: number | null;
    recentWaitMedianSeconds: number | null;
    cycleSamples: number;
    waitSamples: number;
  };
  formation: {
    canForceRelax: boolean;
    secondsUntilForceRelax: number | null;
    bestWindow: null | {
      startIndex: number;
      spread: number;
      tolerance: number | null;
      withinTolerance: boolean;
      waitedSeconds: number | null;
      totalDiff: number;
      pairingGap: number;
      hasBots: boolean;
    };
  };
};

type AdminMatch = {
  id: string;
  status: string;
  selectedMap?: string | null;
  createdAt: string;
  scrimDetails?: { team1Name: string; team2Name: string; notes?: string | null; scheduledAt?: string | null } | null;
  players: Array<{
    userId: string | null;
    isBot?: boolean;
    botName?: string | null;
    accepted?: boolean | null;
    user?: { username?: string | null };
  }>;
};

type AdminUser = {
  id: string;
  username: string;
  email: string | null;
  role: "USER" | "MODERATOR" | "ADMIN" | "BANNED";
  mmr: number;
  rank: string;
  wins: number;
  losses: number;
  isBanned: boolean;
  isSuspect: boolean;
  isComputedSuspicious?: boolean;
  suspicionScore?: number;
  suspicionLevel?: "clear" | "watch" | "suspicious" | "critical";
  suspicionSignals?: Array<{
    code: string;
    label: string;
    detail: string;
    severity: "low" | "medium" | "high";
  }>;
  discordUsername?: string | null;
  bnetBattletag?: string | null;
  createdAt: string;
};

type AdminScrimsResponse = {
  scrims: AdminMatch[];
};

type TeamTestBotsResponse = {
  ok: boolean;
  teamId: string;
  targetSize: number;
  activeCountBefore: number;
  activeCountAfter: number;
  addedCount: number;
  bots: Array<{ id: string; username: string; mmr: number; rank: string; isBot: boolean }>;
};

type AdminUsersResponse = {
  users: AdminUser[];
  total: number;
  page: number;
  pages: number;
};

type ClientErrorEvent = {
  message?: string;
  stack?: string | null;
  context?: string | null;
  url?: string | null;
  userAgent?: string | null;
  timestamp?: string;
  createdAt?: string;
};

type ClientErrorsResponse = {
  count: number;
  events: ClientErrorEvent[];
};

type AdminAuditLog = {
  id: string;
  action: string;
  entityType: string;
  entityId?: string | null;
  summary: string;
  metadata?: Record<string, unknown> | null;
  createdAt: string;
  actor?: { id: string; username: string } | null;
  targetUser?: { id: string; username: string } | null;
};

type AdminAuditLogsResponse = {
  count: number;
  logs: AdminAuditLog[];
};

function formatDateTime(value?: string | number | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatElapsed(joinedAt?: number | null) {
  if (!joinedAt) return "—";
  const seconds = Math.max(0, Math.floor((Date.now() - joinedAt) / 1000));
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes}:${String(rest).padStart(2, "0")}`;
}

function formatSeconds(value?: number | null) {
  if (value == null) return "—";
  const seconds = Math.max(0, Math.round(value));
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  if (minutes <= 0) return `${rest}s`;
  return `${minutes}m ${String(rest).padStart(2, "0")}s`;
}

function winrate(wins: number, losses: number) {
  const total = wins + losses;
  if (!total) return 0;
  return Math.round((wins / total) * 100);
}

function suspicionTone(level?: AdminUser["suspicionLevel"]) {
  if (level === "critical") return "#fb7185";
  if (level === "suspicious") return "#facc15";
  if (level === "watch") return "#fdba74";
  return "#94a3b8";
}

function suspicionLabel(level?: AdminUser["suspicionLevel"]) {
  if (level === "critical") return "Crítico";
  if (level === "suspicious") return "Sospechoso";
  if (level === "watch") return "Watch";
  return "Limpio";
}

function matchmakingStatusCopy(status?: MatchmakingMetrics["status"]) {
  if (status === "ready") return { label: "Listo", detail: "Hay una ventana que puede formar match ahora.", tone: "#86efac" };
  if (status === "force_relax_ready") return { label: "Relax activo", detail: "Cola chica: ya se puede forzar tolerancia por espera.", tone: "#facc15" };
  if (status === "blocked_by_spread") return { label: "Bloqueado por spread", detail: "Hay 10+, pero el spread supera la tolerancia actual.", tone: "#fb7185" };
  return { label: "Esperando players", detail: "Todavía falta completar el tamaño mínimo de match.", tone: "#7dd3fc" };
}

export function Admin() {
  const navigate = useNavigate();
  const { user } = useAuthStore();

  const [stats, setStats] = useState<AdminStats | null>(null);
  const [queue, setQueue] = useState<QueueResponse>({ count: 0, players: [] });
  const [matchmakingMetrics, setMatchmakingMetrics] = useState<MatchmakingMetrics | null>(null);
  const [matches, setMatches] = useState<AdminMatch[]>([]);
  const [scrims, setScrims] = useState<AdminMatch[]>([]);
  const [usersResponse, setUsersResponse] = useState<AdminUsersResponse | null>(null);
  const [clientErrors, setClientErrors] = useState<ClientErrorEvent[]>([]);
  const [auditLogs, setAuditLogs] = useState<AdminAuditLog[]>([]);
  const [userSearch, setUserSearch] = useState("");
  const [userFilter, setUserFilter] = useState<"all" | "suspicious" | "banned" | "clean">("all");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [queueBusy, setQueueBusy] = useState<"clear" | "fill" | null>(null);
  const [matchBusyId, setMatchBusyId] = useState<string | null>(null);
  const [userBusyId, setUserBusyId] = useState<string | null>(null);
  const [surfaceError, setSurfaceError] = useState<string | null>(null);
  const [scrimBusy, setScrimBusy] = useState(false);
  const [scrimForm, setScrimForm] = useState({
    team1Name: 'Storm Alpha',
    team2Name: 'Nexus Beta',
    captain1UserId: '',
    captain2UserId: '',
    team1PlayerIds: '',
    team2PlayerIds: '',
    notes: '',
  });
  const [teamBotForm, setTeamBotForm] = useState({
    teamId: '',
    targetSize: 5,
  });
  const [teamBotResult, setTeamBotResult] = useState<TeamTestBotsResponse | null>(null);

  const loadUsers = useCallback(async (search = userSearch, filter = userFilter) => {
    const { data } = await api.get<AdminUsersResponse>("/admin/users", {
      params: {
        ...(search.trim() ? { search: search.trim() } : {}),
        filter,
      },
    });
    setUsersResponse(data);
  }, [userFilter, userSearch]);

  const loadAdminSurface = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const [statsResponse, queueResponse, metricsResponse, matchesResponse, scrimsResponse, errorsResponse, auditResponse] = await Promise.all([
        api.get<AdminStats>("/admin/stats"),
        api.get<QueueResponse>("/admin/queue"),
        api.get<MatchmakingMetrics>("/admin/matchmaking/metrics"),
        api.get<AdminMatch[]>("/admin/matches"),
        api.get<AdminScrimsResponse>("/admin/scrims"),
        api.get<ClientErrorsResponse>("/admin/monitoring/client-errors", {
          params: { limit: 12 },
        }),
        api.get<AdminAuditLogsResponse>("/admin/audit-logs", {
          params: { limit: 12 },
        }),
      ]);

      setStats(statsResponse.data);
      setQueue(queueResponse.data);
      setMatchmakingMetrics(metricsResponse.data);
      setMatches(
        matchesResponse.data.filter((match) =>
          ["PENDING", "ACCEPTING", "VETOING", "PLAYING", "VOTING", "CANCELLED"].includes(match.status),
        ),
      );
      setScrims(scrimsResponse.data.scrims);
      setClientErrors(errorsResponse.data.events);
      setAuditLogs(auditResponse.data.logs);
      setSurfaceError(null);
    } catch (err: any) {
      setSurfaceError(err?.response?.data?.error?.message ?? "No pude cargar el panel admin.");
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (!user || user.role !== "ADMIN") {
      navigate({ to: "/dashboard" });
      return;
    }

    void loadAdminSurface();
    void loadUsers();

    const interval = window.setInterval(() => {
      void loadAdminSurface();
    }, 8000);

    return () => window.clearInterval(interval);
  }, [loadAdminSurface, loadUsers, navigate, user]);

  const suspectCount = useMemo(
    () => usersResponse?.users.filter((entry) => entry.isSuspect || entry.isComputedSuspicious).length ?? 0,
    [usersResponse],
  );


  function parsePlayerIds(value: string, captainId: string) {
    return [captainId, ...value.split(/[\n,]+/)]
      .map((entry) => entry.trim())
      .filter(Boolean)
      .filter((entry, index, arr) => arr.indexOf(entry) === index);
  }

  async function handleCreateScrim() {
    try {
      setScrimBusy(true);
      const { data } = await api.post<{ matchId: string }>("/admin/scrims", {
        team1Name: scrimForm.team1Name,
        team2Name: scrimForm.team2Name,
        captain1UserId: scrimForm.captain1UserId,
        captain2UserId: scrimForm.captain2UserId,
        team1PlayerIds: parsePlayerIds(scrimForm.team1PlayerIds, scrimForm.captain1UserId),
        team2PlayerIds: parsePlayerIds(scrimForm.team2PlayerIds, scrimForm.captain2UserId),
        notes: scrimForm.notes || undefined,
      });
      await loadAdminSurface();
      navigate({ to: "/match/$matchId", params: { matchId: data.matchId } });
    } catch (err: any) {
      setSurfaceError(err?.response?.data?.error?.message ?? "No pude crear el scrim.");
    } finally {
      setScrimBusy(false);
    }
  }

  async function handleAddTeamBots() {
    try {
      setScrimBusy(true);
      const { data } = await api.post<TeamTestBotsResponse>(`/admin/teams/${teamBotForm.teamId.trim()}/test-bots`, {
        targetSize: teamBotForm.targetSize,
      });
      setTeamBotResult(data);
      await loadAdminSurface();
    } catch (err: any) {
      setSurfaceError(err?.response?.data?.error?.message ?? "No pude agregar bots al equipo.");
    } finally {
      setScrimBusy(false);
    }
  }

  async function handleFillBots() {
    try {
      setQueueBusy("fill");
      await api.post("/admin/queue/fill-bots", { targetSize: 10 });
      await loadAdminSurface();
    } catch (err: any) {
      setSurfaceError(err?.response?.data?.error?.message ?? "No pude completar la cola.");
    } finally {
      setQueueBusy(null);
    }
  }

  async function handleClearQueue() {
    try {
      setQueueBusy("clear");
      await api.post("/admin/queue/clear");
      await loadAdminSurface();
    } catch (err: any) {
      setSurfaceError(err?.response?.data?.error?.message ?? "No pude limpiar la cola.");
    } finally {
      setQueueBusy(null);
    }
  }

  async function handleCancelMatch(matchId: string) {
    try {
      setMatchBusyId(matchId);
      await api.patch(`/admin/matches/${matchId}/cancel`);
      await loadAdminSurface();
    } catch (err: any) {
      setSurfaceError(err?.response?.data?.error?.message ?? "No pude cancelar el match.");
    } finally {
      setMatchBusyId(null);
    }
  }

  async function handleDeleteMatch(matchId: string) {
    try {
      setMatchBusyId(matchId);
      await api.delete(`/admin/matches/${matchId}`);
      await loadAdminSurface();
    } catch (err: any) {
      setSurfaceError(err?.response?.data?.error?.message ?? "No pude borrar el match.");
    } finally {
      setMatchBusyId(null);
    }
  }

  async function handleAdjustMmr(targetUser: AdminUser, delta: number) {
    try {
      setUserBusyId(targetUser.id);
      const mmr = Math.max(0, Math.min(5000, targetUser.mmr + delta));
      await api.patch(`/admin/users/${targetUser.id}/mmr`, { mmr });
      await loadUsers();
    } catch (err: any) {
      setSurfaceError(err?.response?.data?.error?.message ?? "No pude ajustar el MMR.");
    } finally {
      setUserBusyId(null);
    }
  }

  async function handleToggleBan(targetUser: AdminUser) {
    try {
      setUserBusyId(targetUser.id);
      await api.patch(`/admin/users/${targetUser.id}/ban`, {
        banned: !targetUser.isBanned,
        reason: !targetUser.isBanned ? "Acción manual desde panel admin" : undefined,
      });
      await loadUsers();
    } catch (err: any) {
      setSurfaceError(err?.response?.data?.error?.message ?? "No pude cambiar el estado del usuario.");
    } finally {
      setUserBusyId(null);
    }
  }

  async function handleToggleSuspect(targetUser: AdminUser) {
    try {
      setUserBusyId(targetUser.id);
      await api.patch(`/admin/users/${targetUser.id}/suspect`, {
        suspect: !targetUser.isSuspect,
        reason: !targetUser.isSuspect ? "Review manual desde filtros anti-smurf" : undefined,
      });
      await Promise.all([loadUsers(), loadAdminSurface()]);
    } catch (err: any) {
      setSurfaceError(err?.response?.data?.error?.message ?? "No pude cambiar el flag sospechoso.");
    } finally {
      setUserBusyId(null);
    }
  }

  if (!user || user.role !== "ADMIN") return null;

  const matchmakingStatus = matchmakingStatusCopy(matchmakingMetrics?.status);
  const waitBands = matchmakingMetrics?.queue.waitBands;
  const waitBandTotal = waitBands
    ? Math.max(1, waitBands.under30 + waitBands.under60 + waitBands.under120 + waitBands.over120)
    : 1;

  return (
    <div style={pageStyle}>
      <PageHeader
        eyebrow="Admin · War room"
        title="Centro de control competitivo"
        description="Operá cola, matches, usuarios, anti-smurf y telemetría sin depender del dashboard de jugador."
        icon={<Shield size={18} />}
        actions={
          <div style={heroActionsStyle}>
            <button
              type="button"
              onClick={() => void loadAdminSurface()}
              style={primaryActionStyle}
            >
              <RefreshCw size={16} />
              {isRefreshing ? "Actualizando…" : "Refrescar panel"}
            </button>
            <Link to="/dashboard" style={secondaryActionStyle}>
              Ir a jugar
            </Link>
          </div>
        }
      />

      {surfaceError && (
        <div style={errorBannerStyle}>
          <AlertTriangle size={16} />
          <span>{surfaceError}</span>
        </div>
      )}

      <section style={statsGridStyle}>
        <StatCard
          icon={Users}
          label="Usuarios"
          value={stats?.totalUsers ?? "—"}
          tone="#7dd3fc"
          detail="Base total registrada"
        />
        <StatCard
          icon={Swords}
          label="Matches activos"
          value={stats?.activeMatches ?? "—"}
          tone="#fda4af"
          detail="Accept / veto / playing / voting"
        />
        <StatCard
          icon={Gauge}
          label="Cola"
          value={stats?.playersInQueue ?? "—"}
          tone="#86efac"
          detail="Jugadores esperando ahora"
        />
        <StatCard
          icon={ShieldAlert}
          label="Suspect flags"
          value={stats?.suspectUsers ?? suspectCount}
          tone="#facc15"
          detail="Flags persistentes anti-smurf"
        />
      </section>

      <section style={mainGridStyle}>
        <div style={mainColumnStyle}>
          <AdminSection
            eyebrow="Matchmaking health"
            title="Tiempos de espera y balance"
            subtitle="Lectura rápida de si la cola está formando, relajando tolerancia o bloqueada por spread."
            actions={<Tag tone={matchmakingStatus.tone}>{matchmakingStatus.label}</Tag>}
          >
            <div style={healthGridStyle}>
              <MetricTile
                label="Espera más vieja"
                value={formatSeconds(matchmakingMetrics?.queue.oldestWaitSeconds)}
                detail={`Promedio ${formatSeconds(matchmakingMetrics?.queue.averageWaitSeconds)} · p90 ${formatSeconds(matchmakingMetrics?.queue.p90WaitSeconds)}`}
                tone="#7dd3fc"
              />
              <MetricTile
                label="Fill estimado"
                value={formatSeconds(matchmakingMetrics?.eta.estimatedFillSeconds)}
                detail={`${matchmakingMetrics?.queue.missingPlayers ?? 0} slots faltantes · ${matchmakingMetrics?.eta.secondsPerPlayer ?? "—"}s/player`}
                tone="#86efac"
              />
              <MetricTile
                label="Spread cola"
                value={matchmakingMetrics?.queue.mmrSpread ?? "—"}
                detail={`${matchmakingMetrics?.queue.mmrMin ?? "—"}-${matchmakingMetrics?.queue.mmrMax ?? "—"} ELO`}
                tone="#facc15"
              />
              <MetricTile
                label="Ventana candidata"
                value={matchmakingMetrics?.formation.bestWindow?.totalDiff ?? "—"}
                detail={
                  matchmakingMetrics?.formation.bestWindow
                    ? `Spread ${matchmakingMetrics.formation.bestWindow.spread} / tol ${matchmakingMetrics.formation.bestWindow.tolerance ?? "∞"}`
                    : "Sin ventana de 10 evaluable"
                }
                tone={matchmakingMetrics?.formation.bestWindow?.withinTolerance ? "#86efac" : "#fb7185"}
              />
            </div>

            <div style={healthNarrativeStyle}>
              <Clock3 size={16} color={matchmakingStatus.tone} />
              <span>{matchmakingStatus.detail}</span>
              {matchmakingMetrics?.formation.secondsUntilForceRelax != null && matchmakingMetrics.status === "blocked_by_spread" ? (
                <strong style={{ color: "#fde68a" }}>
                  Relax en {formatSeconds(matchmakingMetrics.formation.secondsUntilForceRelax)}
                </strong>
              ) : null}
            </div>

            {waitBands ? (
              <div style={waitBandWrapStyle}>
                <div style={waitBandBarStyle} aria-label="Distribución de espera en cola">
                  {[
                    { key: "under30", value: waitBands.under30, color: "#38bdf8" },
                    { key: "under60", value: waitBands.under60, color: "#86efac" },
                    { key: "under120", value: waitBands.under120, color: "#facc15" },
                    { key: "over120", value: waitBands.over120, color: "#fb7185" },
                  ].map((band) => (
                    <span
                      key={band.key}
                      style={{
                        width: `${(band.value / waitBandTotal) * 100}%`,
                        minWidth: band.value > 0 ? "7px" : 0,
                        background: band.color,
                      }}
                    />
                  ))}
                </div>
                <div style={tinyMetaStyle}>
                  Espera humanos: &lt;30s {waitBands.under30} · 30-60s {waitBands.under60} · 1-2m {waitBands.under120} · +2m {waitBands.over120}
                </div>
              </div>
            ) : null}
          </AdminSection>

          <AdminSection
            eyebrow="Queue monitor"
            title="Cola competitiva"
            subtitle="Vista operativa en vivo con acciones de rescate."
            actions={
              <div style={sectionActionRowStyle}>
                <button
                  type="button"
                  onClick={handleClearQueue}
                  disabled={queueBusy != null}
                  style={dangerSoftButtonStyle}
                >
                  {queueBusy === "clear" ? "Limpiando…" : "Limpiar cola"}
                </button>
                <button
                  type="button"
                  onClick={handleFillBots}
                  disabled={queueBusy != null}
                  style={softButtonStyle}
                >
                  {queueBusy === "fill" ? "Completando…" : "Completar a 10"}
                </button>
              </div>
            }
          >
            {queue.players.length === 0 ? (
              <EmptyState
                icon={Bot}
                title="No hay nadie en cola"
                description="Cuando entren jugadores o bots de testing, aparecen acá con su MMR y tiempo de espera."
              />
            ) : (
              <div style={{ display: "grid", gap: "0.7rem" }}>
                {queue.players.map((player) => (
                  <div key={player.userId} style={listRowStyle}>
                    <div style={{ minWidth: 0 }}>
                      <div style={rowTitleStyle}>
                        {player.username ?? player.userId}
                        {player.isBot && <Tag tone="#38bdf8">BOT</Tag>}
                      </div>
                      <div style={rowMetaStyle}>
                        {player.rank} · {player.mmr} MMR
                        {player.roles?.length ? ` · ${player.roles.join(" / ")}` : ""}
                      </div>
                    </div>
                    <div style={rowSideStyle}>En cola {formatElapsed(player.joinedAt)}</div>
                  </div>
                ))}
              </div>
            )}
          </AdminSection>


          <AdminSection
            eyebrow="Scrims beta"
            title="Crear equipo vs equipo"
            subtitle="Scrim admin/manual para registrar Team A vs Team B sin esperar clanes completos. Pegá IDs de usuario separados por coma o línea."
            actions={<Tag tone="#f0a500">TEAM mode</Tag>}
          >
            <div style={botToolsStyle}>
              <div style={{ display: "grid", gap: "0.3rem" }}>
                <div style={rowTitleStyle}>Bots para self-serve scrims</div>
                <div style={sectionSubtitleStyle}>
                  Pegá el teamId de un equipo real y completalo a 5 miembros con bots. En `/scrims`, el capitán real online puede seleccionarlos como titulares.
                </div>
              </div>
              <div style={sectionActionRowStyle}>
                <input value={teamBotForm.teamId} onChange={(event) => setTeamBotForm((prev) => ({ ...prev, teamId: event.target.value }))} placeholder="teamId" style={searchInputStyle} />
                <input value={teamBotForm.targetSize} onChange={(event) => setTeamBotForm((prev) => ({ ...prev, targetSize: Number(event.target.value) || 5 }))} type="number" min={1} max={10} style={{ ...searchInputStyle, maxWidth: 110 }} />
                <button type="button" onClick={() => void handleAddTeamBots()} disabled={scrimBusy || teamBotForm.teamId.trim().length < 1} style={softButtonStyle}>
                  <Bot size={15} />
                  Completar equipo
                </button>
              </div>
              {teamBotResult ? (
                <div style={tinyMetaStyle}>
                  Agregados {teamBotResult.addedCount} bots · miembros activos {teamBotResult.activeCountBefore} → {teamBotResult.activeCountAfter}
                  {teamBotResult.bots.length ? ` · ${teamBotResult.bots.map((bot) => bot.username).join(", ")}` : " · no hacía falta agregar más"}
                </div>
              ) : null}
            </div>

            <div style={scrimFormGridStyle}>
              <input value={scrimForm.team1Name} onChange={(event) => setScrimForm((prev) => ({ ...prev, team1Name: event.target.value }))} placeholder="Nombre Team A" style={searchInputStyle} />
              <input value={scrimForm.team2Name} onChange={(event) => setScrimForm((prev) => ({ ...prev, team2Name: event.target.value }))} placeholder="Nombre Team B" style={searchInputStyle} />
              <input value={scrimForm.captain1UserId} onChange={(event) => setScrimForm((prev) => ({ ...prev, captain1UserId: event.target.value }))} placeholder="Captain A userId" style={searchInputStyle} />
              <input value={scrimForm.captain2UserId} onChange={(event) => setScrimForm((prev) => ({ ...prev, captain2UserId: event.target.value }))} placeholder="Captain B userId" style={searchInputStyle} />
              <textarea value={scrimForm.team1PlayerIds} onChange={(event) => setScrimForm((prev) => ({ ...prev, team1PlayerIds: event.target.value }))} placeholder="Roster A userIds" style={textareaStyle} />
              <textarea value={scrimForm.team2PlayerIds} onChange={(event) => setScrimForm((prev) => ({ ...prev, team2PlayerIds: event.target.value }))} placeholder="Roster B userIds" style={textareaStyle} />
              <textarea value={scrimForm.notes} onChange={(event) => setScrimForm((prev) => ({ ...prev, notes: event.target.value }))} placeholder="Notas del scrim: Bo3, mapa inicial, contexto" style={{ ...textareaStyle, gridColumn: "1 / -1" }} />
            </div>
            <div style={sectionActionRowStyle}>
              <button type="button" onClick={() => void handleCreateScrim()} disabled={scrimBusy} style={primaryActionStyle}>
                <Swords size={15} />
                {scrimBusy ? "Creando scrim…" : "Crear sala scrim"}
              </button>
              <span style={tinyMetaStyle}>Tip: el capitán se agrega automáticamente al roster de su lado.</span>
            </div>

            {scrims.length > 0 ? (
              <div style={{ display: "grid", gap: "0.65rem", marginTop: "0.85rem" }}>
                {scrims.slice(0, 6).map((scrim) => (
                  <div key={scrim.id} style={matchCardStyle}>
                    <div style={{ minWidth: 0 }}>
                      <div style={rowTitleStyle}>
                        {scrim.scrimDetails?.team1Name ?? "Team A"} vs {scrim.scrimDetails?.team2Name ?? "Team B"}
                        <Tag tone="#f0a500">{scrim.status}</Tag>
                      </div>
                      <div style={rowMetaStyle}>Creado {formatDateTime(scrim.createdAt)} · {scrim.players.filter((player) => !player.isBot).length} jugadores reales</div>
                    </div>
                    <Link to="/match/$matchId" params={{ matchId: scrim.id }} style={tinyLinkStyle}>Abrir sala</Link>
                  </div>
                ))}
              </div>
            ) : null}
          </AdminSection>

          <AdminSection
            eyebrow="Match monitor"
            title="Matches operativos"
            subtitle="Controlá rooms activos, pendientes o colgados sin tocar el dashboard."
          >
            {matches.length === 0 ? (
              <EmptyState
                icon={Cpu}
                title="Sin matches operativos"
                description="No hay matches activos, pendientes o cancelados recientes para intervenir."
              />
            ) : (
              <div style={{ display: "grid", gap: "0.75rem" }}>
                {matches.map((match) => {
                  const humanPlayers = match.players.filter((player) => !player.isBot);
                  const accepted = humanPlayers.filter((player) => player.accepted === true).length;

                  return (
                    <div key={match.id} style={matchCardStyle}>
                      <div style={{ display: "grid", gap: "0.35rem", minWidth: 0 }}>
                        <div style={rowTitleStyle}>
                          {match.scrimDetails ? `${match.scrimDetails.team1Name} vs ${match.scrimDetails.team2Name}` : `${match.status} · ${match.id.slice(0, 8)}`}
                          {match.scrimDetails ? <Tag tone="#f0a500">SCRIM</Tag> : null}
                          {match.selectedMap ? <Tag tone="#c084fc">{match.selectedMap}</Tag> : null}
                        </div>
                        <div style={rowMetaStyle}>
                          {match.players
                            .map((player) => player.user?.username ?? player.botName ?? player.userId?.slice(0, 6) ?? "Bot")
                            .join(" · ")}
                        </div>
                        <div style={tinyMetaStyle}>
                          {match.status === "ACCEPTING"
                            ? `Aceptaron ${accepted}/${humanPlayers.length}`
                            : `Creado ${formatDateTime(match.createdAt)}`}
                        </div>
                      </div>

                      <div style={matchActionsStyle}>
                        <Link
                          to="/match/$matchId"
                          params={{ matchId: match.id }}
                          style={tinyLinkStyle}
                        >
                          Abrir room
                        </Link>
                        <button
                          type="button"
                          onClick={() => void handleCancelMatch(match.id)}
                          disabled={matchBusyId === match.id}
                          style={softWarnButtonStyle}
                        >
                          Cancelar
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDeleteMatch(match.id)}
                          disabled={matchBusyId === match.id}
                          style={dangerSoftButtonStyle}
                        >
                          Borrar
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </AdminSection>
        </div>

        <div style={sideColumnStyle}>
          <AdminSection
            eyebrow="User tools"
            title="Jugadores y ELO tools"
            subtitle="Buscá usuarios, filtrá riesgo anti-smurf, ajustá MMR y marcá cuentas conflictivas."
            actions={
              <div style={{ display: "grid", gap: "0.55rem" }}>
                <div style={filterRailStyle}>
                  {[
                    ["all", "Todos"],
                    ["suspicious", "Sospechosos"],
                    ["banned", "Baneados"],
                    ["clean", "Limpios"],
                  ].map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => {
                        const nextFilter = value as typeof userFilter;
                        setUserFilter(nextFilter);
                        void loadUsers(userSearch, nextFilter);
                      }}
                      style={userFilter === value ? activeFilterButtonStyle : filterButtonStyle}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <div style={sectionActionRowStyle}>
                  <input
                    value={userSearch}
                    onChange={(event) => setUserSearch(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") void loadUsers();
                    }}
                    placeholder="Buscar por username o email"
                    style={searchInputStyle}
                  />
                  <button type="button" onClick={() => void loadUsers()} style={softButtonStyle}>
                    Buscar
                  </button>
                </div>
              </div>
            }
          >
            <div style={{ display: "grid", gap: "0.75rem" }}>
              {(usersResponse?.users ?? []).map((entry) => (
                <div
                  key={entry.id}
                  style={{
                    ...userCardStyle,
                    borderColor: `${suspicionTone(entry.suspicionLevel)}33`,
                  }}
                >
                  <div style={{ display: "grid", gap: "0.28rem", minWidth: 0 }}>
                    <div style={rowTitleStyle}>
                      {entry.username}
                      <Tag tone={entry.isBanned ? "#f87171" : entry.role === "ADMIN" ? "#7dd3fc" : "#94a3b8"}>
                        {entry.role}
                      </Tag>
                      <Tag tone={suspicionTone(entry.suspicionLevel)}>
                        {suspicionLabel(entry.suspicionLevel)} · {entry.suspicionScore ?? 0}
                      </Tag>
                      {entry.isSuspect ? <Tag tone="#facc15">Flag manual</Tag> : null}
                    </div>
                    <div style={rowMetaStyle}>
                      {entry.email ?? "Sin email"} · {entry.rank} · {entry.mmr} MMR · WR {winrate(entry.wins, entry.losses)}%
                    </div>
                    <div style={tinyMetaStyle}>
                      Discord: {entry.discordUsername ?? "sin vincular"} · BNet: {entry.bnetBattletag ?? "sin vincular"} · Alta {formatDateTime(entry.createdAt)}
                    </div>
                    {entry.suspicionSignals?.length ? (
                      <div style={signalListStyle}>
                        {entry.suspicionSignals.slice(0, 3).map((signal) => (
                          <span key={signal.code} title={signal.detail} style={signalPillStyle}>
                            {signal.label}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>

                  <div style={userActionsGridStyle}>
                    {[-100, -25, 25, 100].map((delta) => (
                      <button
                        key={delta}
                        type="button"
                        disabled={userBusyId === entry.id}
                        onClick={() => void handleAdjustMmr(entry, delta)}
                        style={delta > 0 ? softButtonStyle : softWarnButtonStyle}
                      >
                        {delta > 0 ? `+${delta}` : String(delta)}
                      </button>
                    ))}
                    <button
                      type="button"
                      disabled={userBusyId === entry.id}
                      onClick={() => void handleToggleBan(entry)}
                      style={entry.isBanned ? softButtonStyle : dangerSoftButtonStyle}
                    >
                      {entry.isBanned ? "Desbanear" : "Banear"}
                    </button>
                    <button
                      type="button"
                      disabled={userBusyId === entry.id}
                      onClick={() => void handleToggleSuspect(entry)}
                      style={entry.isSuspect ? softButtonStyle : softWarnButtonStyle}
                    >
                      {entry.isSuspect ? "Limpiar flag" : "Marcar suspect"}
                    </button>
                  </div>
                </div>
              ))}
              {(usersResponse?.users ?? []).length === 0 ? (
                <EmptyState
                  icon={ShieldAlert}
                  title="Sin usuarios para este filtro"
                  description="Probá cambiar el filtro anti-smurf o buscar por otro username/email."
                />
              ) : null}
            </div>
          </AdminSection>

          <AdminSection
            eyebrow="Client errors"
            title="Errores de cliente"
            subtitle="Telemetría cruda para detectar crashes, loops y problemas de runtime."
          >
            {clientErrors.length === 0 ? (
              <EmptyState
                icon={Shield}
                title="Sin eventos recientes"
                description="Todavía no entraron errores recientes desde el frontend."
              />
            ) : (
              <div style={{ display: "grid", gap: "0.65rem" }}>
                {clientErrors.map((event, index) => (
                  <div key={`${event.createdAt ?? event.timestamp ?? "err"}-${index}`} style={errorCardStyle}>
                    <div style={rowTitleStyle}>{event.message ?? "Unknown client error"}</div>
                    <div style={rowMetaStyle}>
                      {event.context ?? "Sin contexto"} · {formatDateTime(event.createdAt ?? event.timestamp)}
                    </div>
                    {event.url ? <div style={tinyMetaStyle}>{event.url}</div> : null}
                  </div>
                ))}
              </div>
            )}
          </AdminSection>

          <AdminSection
            eyebrow="Audit trail"
            title="Audit logs"
            subtitle="Trazabilidad persistente de las acciones operativas del panel admin."
          >
            {auditLogs.length === 0 ? (
              <EmptyState
                icon={Shield}
                title="Sin acciones registradas"
                description="Cuando un admin toque cola, matches o usuarios, la traza persistente aparece acá."
              />
            ) : (
              <div style={{ display: "grid", gap: "0.65rem" }}>
                {auditLogs.map((entry) => (
                  <div key={entry.id} style={auditCardStyle}>
                    <div style={rowTitleStyle}>
                      <span>{entry.summary}</span>
                      <Tag tone="#7dd3fc">{entry.action.replaceAll("_", " ")}</Tag>
                    </div>
                    <div style={rowMetaStyle}>
                      {entry.actor?.username ?? "Admin"} · {entry.entityType}
                      {entry.targetUser?.username ? ` · Target ${entry.targetUser.username}` : ""}
                    </div>
                    <div style={tinyMetaStyle}>
                      {formatDateTime(entry.createdAt)}
                      {entry.entityId ? ` · ${entry.entityId.slice(0, 12)}` : ""}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </AdminSection>
        </div>
      </section>
    </div>
  );
}

function AdminSection({
  eyebrow,
  title,
  subtitle,
  actions,
  children,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section style={sectionStyle}>
      <div style={sectionHeaderStyle}>
        <div style={{ display: "grid", gap: "0.25rem" }}>
          <div style={eyebrowStyle}>{eyebrow}</div>
          <div style={sectionTitleStyle}>{title}</div>
          <div style={sectionSubtitleStyle}>{subtitle}</div>
        </div>
        {actions ? <div>{actions}</div> : null}
      </div>
      {children}
    </section>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  tone,
  detail,
}: {
  icon: typeof Users;
  label: string;
  value: string | number;
  tone: string;
  detail: string;
}) {
  return (
    <div style={{ ...statCardStyle, borderColor: `${tone}32` }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.75rem" }}>
        <div style={{ color: "rgba(226,232,240,0.72)", fontSize: "0.76rem", fontWeight: 900, letterSpacing: "0.14em", textTransform: "uppercase" }}>
          {label}
        </div>
        <Icon size={16} color={tone} />
      </div>
      <div style={{ color: tone, fontFamily: "var(--font-display)", fontSize: "1.8rem", letterSpacing: "0.05em" }}>
        {value}
      </div>
      <div style={sectionSubtitleStyle}>{detail}</div>
    </div>
  );
}

function MetricTile({
  label,
  value,
  detail,
  tone,
}: {
  label: string;
  value: string | number;
  detail: string;
  tone: string;
}) {
  return (
    <div style={{ ...metricTileStyle, borderColor: `${tone}26` }}>
      <div style={{ color: "rgba(226,232,240,0.58)", fontSize: "0.66rem", fontWeight: 900, letterSpacing: "0.13em", textTransform: "uppercase" }}>
        {label}
      </div>
      <div style={{ color: tone, fontFamily: "var(--font-display)", fontSize: "1.25rem", letterSpacing: "0.05em" }}>
        {value}
      </div>
      <div style={tinyMetaStyle}>{detail}</div>
    </div>
  );
}

function EmptyState({
  icon: Icon,
  title,
  description,
}: {
  icon: typeof Users;
  title: string;
  description: string;
}) {
  return (
    <div style={emptyStateStyle}>
      <Icon size={18} color="#7dd3fc" />
      <div style={{ display: "grid", gap: "0.15rem" }}>
        <strong style={{ color: "#e2e8f0" }}>{title}</strong>
        <span style={sectionSubtitleStyle}>{description}</span>
      </div>
    </div>
  );
}

function Tag({ tone, children }: { tone: string; children: ReactNode }) {
  return (
    <span
      style={{
        padding: "0.18rem 0.38rem",
        border: `1px solid ${tone}55`,
        background: `${tone}16`,
        color: tone,
        fontSize: "0.58rem",
        fontWeight: 900,
        letterSpacing: "0.12em",
        textTransform: "uppercase",
      }}
    >
      {children}
    </span>
  );
}

const pageStyle: CSSProperties = {
  display: "grid",
  gap: "1rem",
};

const heroActionsStyle: CSSProperties = {
  display: "flex",
  gap: "0.7rem",
  flexWrap: "wrap",
};

const eyebrowStyle: CSSProperties = {
  color: "#7dd3fc",
  fontSize: "0.68rem",
  fontWeight: 900,
  letterSpacing: "0.16em",
  textTransform: "uppercase",
};

const primaryActionStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: "0.45rem",
  border: "1px solid rgba(125,211,252,0.3)",
  background: "linear-gradient(90deg, rgba(14,165,233,0.18), rgba(59,130,246,0.2))",
  color: "#e0f2fe",
  padding: "0.72rem 0.9rem",
  cursor: "pointer",
  fontWeight: 800,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  textDecoration: "none",
};

const secondaryActionStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  border: "1px solid rgba(148,163,184,0.2)",
  background: "rgba(15,23,42,0.72)",
  color: "#e2e8f0",
  padding: "0.72rem 0.9rem",
  fontWeight: 800,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  textDecoration: "none",
};

const errorBannerStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "0.55rem",
  border: "1px solid rgba(248,113,113,0.28)",
  background: "rgba(127,29,29,0.16)",
  color: "#fecaca",
  padding: "0.85rem 1rem",
};

const statsGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: "0.85rem",
};

const statCardStyle: CSSProperties = {
  border: "1px solid rgba(148,163,184,0.12)",
  background: "rgba(5,10,18,0.92)",
  padding: "0.95rem 1rem",
  display: "grid",
  gap: "0.55rem",
};

const mainGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) minmax(320px, 420px)",
  gap: "1rem",
  alignItems: "start",
};

const mainColumnStyle: CSSProperties = {
  minWidth: 0,
  display: "grid",
  gap: "1rem",
};

const sideColumnStyle: CSSProperties = {
  minWidth: 0,
  display: "grid",
  gap: "1rem",
};

const sectionStyle: CSSProperties = {
  minWidth: 0,
  border: "1px solid rgba(148,163,184,0.12)",
  background: "rgba(4,9,16,0.94)",
  padding: "1rem",
  display: "grid",
  gap: "1rem",
};

const sectionHeaderStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: "0.9rem",
  alignItems: "flex-start",
  flexWrap: "wrap",
};

const sectionTitleStyle: CSSProperties = {
  color: "#f8fafc",
  fontFamily: "var(--font-display)",
  fontSize: "1.04rem",
  letterSpacing: "0.04em",
  textTransform: "uppercase",
};

const sectionSubtitleStyle: CSSProperties = {
  color: "rgba(148,163,184,0.82)",
  fontSize: "0.84rem",
  lineHeight: 1.45,
};

const sectionActionRowStyle: CSSProperties = {
  minWidth: 0,
  display: "flex",
  gap: "0.55rem",
  flexWrap: "wrap",
};

const healthGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
  gap: "0.65rem",
};

const metricTileStyle: CSSProperties = {
  display: "grid",
  gap: "0.35rem",
  padding: "0.75rem 0.8rem",
  border: "1px solid rgba(148,163,184,0.12)",
  background: "rgba(15,23,42,0.38)",
};

const healthNarrativeStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "0.5rem",
  flexWrap: "wrap",
  border: "1px solid rgba(148,163,184,0.12)",
  background: "rgba(2,6,23,0.34)",
  color: "rgba(226,232,240,0.74)",
  padding: "0.72rem 0.8rem",
  fontSize: "0.84rem",
};

const waitBandWrapStyle: CSSProperties = {
  display: "grid",
  gap: "0.38rem",
};

const waitBandBarStyle: CSSProperties = {
  display: "flex",
  overflow: "hidden",
  height: "0.55rem",
  border: "1px solid rgba(148,163,184,0.14)",
  background: "rgba(15,23,42,0.72)",
};

const filterRailStyle: CSSProperties = {
  display: "flex",
  gap: "0.4rem",
  flexWrap: "wrap",
  justifyContent: "flex-end",
};

const filterButtonStyle: CSSProperties = {
  border: "1px solid rgba(148,163,184,0.16)",
  background: "rgba(2,6,23,0.6)",
  color: "rgba(226,232,240,0.72)",
  padding: "0.48rem 0.6rem",
  cursor: "pointer",
  fontSize: "0.7rem",
  fontWeight: 900,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
};

const activeFilterButtonStyle: CSSProperties = {
  ...filterButtonStyle,
  border: "1px solid rgba(250,204,21,0.34)",
  background: "rgba(250,204,21,0.13)",
  color: "#fef08a",
};

const searchInputStyle: CSSProperties = {
  minWidth: 0,
  flex: "1 1 180px",
  border: "1px solid rgba(148,163,184,0.18)",
  background: "rgba(2,6,23,0.72)",
  color: "#e2e8f0",
  padding: "0.72rem 0.8rem",
  outline: "none",
};

const softButtonStyle: CSSProperties = {
  border: "1px solid rgba(125,211,252,0.24)",
  background: "rgba(14,165,233,0.10)",
  color: "#bae6fd",
  padding: "0.62rem 0.75rem",
  cursor: "pointer",
  fontWeight: 800,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
};

const softWarnButtonStyle: CSSProperties = {
  border: "1px solid rgba(251,191,36,0.25)",
  background: "rgba(251,191,36,0.10)",
  color: "#fde68a",
  padding: "0.62rem 0.75rem",
  cursor: "pointer",
  fontWeight: 800,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
};

const dangerSoftButtonStyle: CSSProperties = {
  border: "1px solid rgba(248,113,113,0.28)",
  background: "rgba(248,113,113,0.10)",
  color: "#fecaca",
  padding: "0.62rem 0.75rem",
  cursor: "pointer",
  fontWeight: 800,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
};

const listRowStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: "0.75rem",
  alignItems: "center",
  padding: "0.8rem 0.85rem",
  border: "1px solid rgba(148,163,184,0.12)",
  background: "rgba(15,23,42,0.48)",
};

const rowTitleStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "0.45rem",
  flexWrap: "wrap",
  color: "#f8fafc",
  fontWeight: 800,
};

const rowMetaStyle: CSSProperties = {
  color: "rgba(226,232,240,0.58)",
  fontSize: "0.84rem",
  lineHeight: 1.45,
};

const tinyMetaStyle: CSSProperties = {
  color: "rgba(148,163,184,0.72)",
  fontSize: "0.76rem",
  lineHeight: 1.45,
};

const rowSideStyle: CSSProperties = {
  color: "#7dd3fc",
  fontWeight: 800,
  fontSize: "0.8rem",
  whiteSpace: "nowrap",
};

const matchCardStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) auto",
  gap: "0.8rem",
  alignItems: "center",
  padding: "0.85rem 0.9rem",
  border: "1px solid rgba(148,163,184,0.12)",
  background: "rgba(15,23,42,0.48)",
};

const matchActionsStyle: CSSProperties = {
  display: "flex",
  gap: "0.45rem",
  flexWrap: "wrap",
  justifyContent: "flex-end",
};

const tinyLinkStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  border: "1px solid rgba(148,163,184,0.18)",
  background: "rgba(2,6,23,0.7)",
  color: "#e2e8f0",
  padding: "0.62rem 0.75rem",
  textDecoration: "none",
  fontWeight: 800,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
};

const userCardStyle: CSSProperties = {
  display: "grid",
  gap: "0.8rem",
  padding: "0.85rem 0.9rem",
  border: "1px solid rgba(148,163,184,0.12)",
  background: "rgba(15,23,42,0.48)",
};

const userActionsGridStyle: CSSProperties = {
  minWidth: 0,
  display: "flex",
  gap: "0.45rem",
  flexWrap: "wrap",
};

const signalListStyle: CSSProperties = {
  display: "flex",
  gap: "0.35rem",
  flexWrap: "wrap",
  paddingTop: "0.2rem",
};

const signalPillStyle: CSSProperties = {
  border: "1px solid rgba(250,204,21,0.2)",
  background: "rgba(250,204,21,0.08)",
  color: "#fde68a",
  padding: "0.22rem 0.38rem",
  fontSize: "0.68rem",
  fontWeight: 800,
};

const errorCardStyle: CSSProperties = {
  display: "grid",
  gap: "0.3rem",
  padding: "0.8rem 0.85rem",
  border: "1px solid rgba(248,113,113,0.14)",
  background: "rgba(28,10,12,0.34)",
};

const auditCardStyle: CSSProperties = {
  display: "grid",
  gap: "0.32rem",
  padding: "0.8rem 0.85rem",
  border: "1px solid rgba(125,211,252,0.14)",
  background: "rgba(8,20,34,0.4)",
};

const emptyStateStyle: CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  gap: "0.7rem",
  padding: "0.9rem 1rem",
  border: "1px dashed rgba(148,163,184,0.18)",
  background: "rgba(2,6,23,0.35)",
};

const botToolsStyle: CSSProperties = {
  display: "grid",
  gap: "0.65rem",
  padding: "0.85rem",
  border: "1px solid rgba(14,165,233,0.18)",
  background: "rgba(14,165,233,0.08)",
};

const scrimFormGridStyle: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "0.65rem", marginBottom: "0.75rem" };
const textareaStyle: CSSProperties = { ...searchInputStyle, minHeight: "78px", resize: "vertical" };
