import type { CSSProperties, ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  AlertTriangle,
  Bot,
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

type AdminStats = {
  totalUsers: number;
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

type AdminMatch = {
  id: string;
  status: string;
  selectedMap?: string | null;
  createdAt: string;
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
  discordUsername?: string | null;
  createdAt: string;
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

function winrate(wins: number, losses: number) {
  const total = wins + losses;
  if (!total) return 0;
  return Math.round((wins / total) * 100);
}

export function Admin() {
  const navigate = useNavigate();
  const { user } = useAuthStore();

  const [stats, setStats] = useState<AdminStats | null>(null);
  const [queue, setQueue] = useState<QueueResponse>({ count: 0, players: [] });
  const [matches, setMatches] = useState<AdminMatch[]>([]);
  const [usersResponse, setUsersResponse] = useState<AdminUsersResponse | null>(null);
  const [clientErrors, setClientErrors] = useState<ClientErrorEvent[]>([]);
  const [userSearch, setUserSearch] = useState("");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [queueBusy, setQueueBusy] = useState<"clear" | "fill" | null>(null);
  const [matchBusyId, setMatchBusyId] = useState<string | null>(null);
  const [userBusyId, setUserBusyId] = useState<string | null>(null);
  const [surfaceError, setSurfaceError] = useState<string | null>(null);

  const loadUsers = useCallback(async (search = userSearch) => {
    const { data } = await api.get<AdminUsersResponse>("/admin/users", {
      params: search.trim() ? { search: search.trim() } : undefined,
    });
    setUsersResponse(data);
  }, [userSearch]);

  const loadAdminSurface = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const [statsResponse, queueResponse, matchesResponse, errorsResponse] = await Promise.all([
        api.get<AdminStats>("/admin/stats"),
        api.get<QueueResponse>("/admin/queue"),
        api.get<AdminMatch[]>("/admin/matches"),
        api.get<ClientErrorsResponse>("/admin/monitoring/client-errors", {
          params: { limit: 12 },
        }),
      ]);

      setStats(statsResponse.data);
      setQueue(queueResponse.data);
      setMatches(
        matchesResponse.data.filter((match) =>
          ["PENDING", "ACCEPTING", "VETOING", "PLAYING", "VOTING", "CANCELLED"].includes(match.status),
        ),
      );
      setClientErrors(errorsResponse.data.events);
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
    () => usersResponse?.users.filter((entry) => entry.isSuspect).length ?? 0,
    [usersResponse],
  );

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

  if (!user || user.role !== "ADMIN") return null;

  return (
    <div style={pageStyle}>
      <section style={heroStyle}>
        <div style={{ display: "grid", gap: "0.45rem" }}>
          <div style={eyebrowStyle}>Admin · War room</div>
          <h1 style={titleStyle}>Centro de control competitivo</h1>
          <p style={subtitleStyle}>
            Operá cola, matches, usuarios y telemetría sin depender del dashboard de jugador.
          </p>
        </div>

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
      </section>

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
          value={suspectCount}
          tone="#facc15"
          detail="Jugadores marcados como sospechosos"
        />
      </section>

      <section style={mainGridStyle}>
        <div style={{ display: "grid", gap: "1rem" }}>
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
                          {match.status} · {match.id.slice(0, 8)}
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

        <div style={{ display: "grid", gap: "1rem" }}>
          <AdminSection
            eyebrow="User tools"
            title="Jugadores y ELO tools"
            subtitle="Buscá usuarios, ajustá MMR y marcá cuentas conflictivas."
            actions={
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
            }
          >
            <div style={{ display: "grid", gap: "0.75rem" }}>
              {(usersResponse?.users ?? []).map((entry) => (
                <div key={entry.id} style={userCardStyle}>
                  <div style={{ display: "grid", gap: "0.28rem", minWidth: 0 }}>
                    <div style={rowTitleStyle}>
                      {entry.username}
                      <Tag tone={entry.isBanned ? "#f87171" : entry.role === "ADMIN" ? "#7dd3fc" : "#94a3b8"}>
                        {entry.role}
                      </Tag>
                      {entry.isSuspect ? <Tag tone="#facc15">Suspect</Tag> : null}
                    </div>
                    <div style={rowMetaStyle}>
                      {entry.email ?? "Sin email"} · {entry.rank} · {entry.mmr} MMR · WR {winrate(entry.wins, entry.losses)}%
                    </div>
                    <div style={tinyMetaStyle}>
                      Discord: {entry.discordUsername ?? "sin vincular"} · Alta {formatDateTime(entry.createdAt)}
                    </div>
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
                  </div>
                </div>
              ))}
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

const heroStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-end",
  gap: "1rem",
  flexWrap: "wrap",
  padding: "1.2rem",
  border: "1px solid rgba(125,211,252,0.16)",
  background:
    "linear-gradient(135deg, rgba(4,10,20,0.98), rgba(7,18,35,0.96) 55%, rgba(0,200,255,0.08))",
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

const titleStyle: CSSProperties = {
  margin: 0,
  color: "#f8fafc",
  fontFamily: "var(--font-display)",
  fontSize: "clamp(1.6rem, 3vw, 2.1rem)",
  letterSpacing: "0.05em",
  textTransform: "uppercase",
};

const subtitleStyle: CSSProperties = {
  margin: 0,
  color: "rgba(226,232,240,0.68)",
  maxWidth: "72ch",
  lineHeight: 1.55,
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
  gridTemplateColumns: "minmax(0, 1.2fr) minmax(340px, 0.95fr)",
  gap: "1rem",
};

const sectionStyle: CSSProperties = {
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
  display: "flex",
  gap: "0.55rem",
  flexWrap: "wrap",
};

const searchInputStyle: CSSProperties = {
  minWidth: "240px",
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
  display: "flex",
  gap: "0.45rem",
  flexWrap: "wrap",
};

const errorCardStyle: CSSProperties = {
  display: "grid",
  gap: "0.3rem",
  padding: "0.8rem 0.85rem",
  border: "1px solid rgba(248,113,113,0.14)",
  background: "rgba(28,10,12,0.34)",
};

const emptyStateStyle: CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  gap: "0.7rem",
  padding: "0.9rem 1rem",
  border: "1px dashed rgba(148,163,184,0.18)",
  background: "rgba(2,6,23,0.35)",
};
