import { useEffect, useMemo, useState } from "react";
import {
  Outlet,
  Link,
  useNavigate,
  useRouterState,
} from "@tanstack/react-router";
import {
  Activity,
  BarChart3,
  Bell,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  LogOut,
  MessageCircle,
  Newspaper,
  Search,
  Settings,
  Shield,
  Swords,
  Trophy,
  User,
  Users,
  Zap,
} from "lucide-react";
import { useAuthStore } from "../stores/auth.store";
import { api } from "../lib/api";
import { useSocketStore } from "../stores/socket.store";

const LEVEL_COLORS: Record<number, string> = {
  1: "#6b7280",
  2: "#a16207",
  3: "#94a3b8",
  4: "#eab308",
  5: "#06b6d4",
  6: "#3b82f6",
  7: "#8b5cf6",
  8: "#d946ef",
  9: "#f97316",
  10: "#fb2424",
};

const LEVEL_BANDS = [
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

type SearchResult = {
  id: string;
  username: string;
  avatar: string | null;
  mmr: number;
  wins: number;
  losses: number;
  mainRole?: PlayerRole | null;
  secondaryRole?: PlayerRole | null;
  level?: number;
  displayLevel?: string;
};

type PlayerRole = "TANK" | "DPS" | "BRUISER" | "SUPPORT" | "HEALER";

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
  };
};

type NavItem = {
  label: string;
  icon: typeof Swords;
  to?: string;
  disabled?: boolean;
  badge?: string;
};

const primaryNav: NavItem[] = [
  { label: "Jugar", icon: Swords, to: "/dashboard" },
  { label: "Leaderboard", icon: Trophy, to: "/leaderboard" },
  { label: "Estadísticas", icon: BarChart3, disabled: true, badge: "soon" },
  { label: "Noticias", icon: Newspaper, disabled: true, badge: "discord" },
];

const accountNav: NavItem[] = [
  { label: "Mi perfil", icon: User, to: "/profile" },
  { label: "Configuración", icon: Settings, disabled: true, badge: "soon" },
];

const ROLE_LABELS: Record<PlayerRole, string> = {
  TANK: "Tank",
  DPS: "DPS",
  BRUISER: "Offlane",
  SUPPORT: "Support",
  HEALER: "Healer",
};

const roleAccents: Record<PlayerRole, string> = {
  TANK: "#38bdf8",
  DPS: "#fb7185",
  BRUISER: "#f97316",
  SUPPORT: "#a78bfa",
  HEALER: "#4ade80",
};

function getLevelMeta(rawMmr: number) {
  const mmr = Math.max(0, rawMmr);
  const band =
    LEVEL_BANDS.find((candidate) => {
      if (candidate.max == null) return mmr >= candidate.min;
      return mmr >= candidate.min && mmr <= candidate.max;
    }) ?? LEVEL_BANDS[0];

  if (band.max == null) {
    return {
      level: band.level,
      progressPct: 100,
      nextLevelAt: null as number | null,
    };
  }

  const span = band.max - band.min + 1;
  const progressPct = Math.max(
    0,
    Math.min(100, Math.floor(((mmr - band.min + 1) / span) * 100)),
  );

  return { level: band.level, progressPct, nextLevelAt: band.max + 1 };
}

function formatMatchDate(value: string) {
  return new Date(value).toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "2-digit",
  });
}

function winrate(wins: number, losses: number) {
  const total = wins + losses;
  if (total === 0) return 0;
  return Math.round((wins / total) * 100);
}

export function AppLayout() {
  const { user, logout } = useAuthStore();
  const { status: socketStatus, reconnectAttempts, lastError } = useSocketStore();
  const navigate = useNavigate();
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });

  const [recentMatches, setRecentMatches] = useState<MatchHistoryEntry[]>([]);
  const [isHistoryOpen, setIsHistoryOpen] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);

  const levelMeta = useMemo(() => getLevelMeta(user?.mmr ?? 0), [user?.mmr]);
  const level = levelMeta.level;
  const rankColor = LEVEL_COLORS[level] || "var(--nexus-accent)";
  const pointsToNextLevel =
    !user || levelMeta.nextLevelAt == null
      ? 0
      : Math.max(0, levelMeta.nextLevelAt - user.mmr);
  const socketMeta = getSocketMeta(socketStatus);

  useEffect(() => {
    if (!user?.username) return;

    api
      .get<MatchHistoryEntry[]>(`/users/${user.username}/matches`)
      .then(({ data }) => setRecentMatches(data.slice(0, 6)))
      .catch(() => setRecentMatches([]));
  }, [user?.username]);

  useEffect(() => {
    const term = searchTerm.trim();
    if (term.length < 2) {
      setSearchResults([]);
      setSearchLoading(false);
      return;
    }

    let cancelled = false;
    setSearchLoading(true);

    const timer = window.setTimeout(() => {
      api
        .get<SearchResult[]>("/users/search", { params: { q: term } })
        .then(({ data }) => {
          if (!cancelled) setSearchResults(data);
        })
        .catch(() => {
          if (!cancelled) setSearchResults([]);
        })
        .finally(() => {
          if (!cancelled) setSearchLoading(false);
        });
    }, 220);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [searchTerm]);

  async function handleLogout() {
    await api.post("/auth/logout").catch(() => {});
    logout();
    navigate({ to: "/" });
  }

  function openPlayer(username: string) {
    setSearchTerm("");
    setSearchResults([]);
    navigate({ to: "/profile/$username", params: { username } });
  }

  if (!user) return null;

  return (
    <div style={styles.shell}>
      <aside style={styles.commandRail}>
        <Link to="/dashboard" style={styles.brandLockup}>
          <div style={styles.brandMarkWrap}>
            <img src="/brand/logo.png" alt="NexusGG" style={styles.brandMark} />
          </div>
          <div>
            <div style={styles.brandName}>NexusGG</div>
            <div style={styles.brandSubline}>HOTS SA Command</div>
          </div>
        </Link>

        <div style={styles.searchBlock}>
          <div style={styles.searchLabel}>Buscar jugador</div>
          <div style={styles.searchInputWrap}>
            <Search size={15} style={styles.searchIcon} />
            <input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Jugador, equipo, torneo..."
              style={styles.searchInput}
            />
          </div>

          {(searchTerm.trim().length >= 2 || searchResults.length > 0) && (
            <div style={styles.searchResultsPanel}>
              {searchLoading ? (
                <MiniState text="Rastreando perfiles..." />
              ) : searchResults.length === 0 ? (
                <MiniState text="Sin jugadores encontrados" />
              ) : (
                searchResults.map((player) => (
                  <button
                    key={player.id}
                    type="button"
                    onClick={() => openPlayer(player.username)}
                    style={styles.searchResultButton}
                  >
                    <Avatar username={player.username} avatar={player.avatar} size={32} />
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={styles.searchResultName}>{player.username}</div>
                      <div style={styles.searchResultMeta}>
                        Lvl {player.level ?? getLevelMeta(player.mmr).level} · {player.mmr} MMR
                      </div>
                    </div>
                    <ChevronRight size={15} color="rgba(232,244,255,0.45)" />
                  </button>
                ))
              )}
            </div>
          )}
        </div>

        <RailSection eyebrow="Matchmaking">
          {primaryNav.map((item) => (
            <RailItem key={item.label} item={item} active={isNavActive(pathname, item)} />
          ))}
        </RailSection>

        <RailSection eyebrow="Cuenta">
          {accountNav.map((item) => (
            <RailItem key={item.label} item={item} active={isNavActive(pathname, item)} />
          ))}
        </RailSection>

        <div style={styles.railBottom}>
          <div style={styles.discordPanel}>
            <MessageCircle size={16} color="#a5b4fc" />
            <div style={{ minWidth: 0 }}>
              <div style={styles.discordTitle}>Comunidad Discord</div>
              <div style={styles.discordText}>Anuncios, soporte y testers</div>
            </div>
            <a
              href={import.meta.env.VITE_DISCORD_INVITE || "#"}
              target="_blank"
              rel="noopener noreferrer"
              style={styles.discordButton}
              aria-label="Abrir Discord"
            >
              <ExternalLink size={14} />
            </a>
          </div>

          <button type="button" onClick={handleLogout} style={styles.logoutButton}>
            <LogOut size={15} />
            Cerrar sesión
          </button>
        </div>
      </aside>

      <main style={styles.mainStage}>
        <Outlet />
      </main>

      <aside style={styles.playerSpine}>
        <section style={styles.playerCorePanel}>
          <div style={styles.spineTopRow}>
            <div>
              <div style={styles.panelEyebrow}>Player spine</div>
              <div style={styles.panelTitle}>Estado competitivo</div>
            </div>
            <div style={{ ...styles.connectionPill, borderColor: `${socketMeta.color}55` }}>
              <span style={{ ...styles.connectionDot, background: socketMeta.color }} />
              {socketMeta.label}
            </div>
          </div>

          <div style={styles.identityBlock}>
            <div style={{ ...styles.levelOrb, borderColor: rankColor, boxShadow: `0 0 34px ${rankColor}33` }}>
              <Avatar username={user.username} avatar={user.avatar} size={72} />
              <div style={{ ...styles.levelChip, color: rankColor, borderColor: `${rankColor}99` }}>
                {level}
              </div>
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={styles.username}>{user.username}</div>
              <div style={styles.rankLine}>Lvl {level} · {user.mmr.toLocaleString("es-AR")} MMR</div>
              <div style={styles.roleRow}>
                <RoleBadge role={user.mainRole as PlayerRole | null | undefined} fallback="Main sin definir" />
                <RoleBadge role={user.secondaryRole as PlayerRole | null | undefined} fallback="Alt sin definir" muted />
              </div>
            </div>
          </div>

          <div style={styles.progressHeader}>
            <span>Progreso al próximo nivel</span>
            <strong style={{ color: rankColor }}>
              {levelMeta.nextLevelAt == null ? "Nivel máximo" : `+${pointsToNextLevel}`}
            </strong>
          </div>
          <div style={styles.progressTrack}>
            <div
              style={{
                ...styles.progressFill,
                width: `${levelMeta.progressPct}%`,
                background: `linear-gradient(90deg, ${rankColor}, #00c8ff)`,
              }}
            />
            <div style={styles.progressGrid} />
          </div>

          <div style={styles.statsGrid}>
            <SpineStat label="Wins" value={user.wins} tone="#4ade80" />
            <SpineStat label="Losses" value={user.losses} tone="#fb7185" />
            <SpineStat label="WR" value={`${winrate(user.wins, user.losses)}%`} tone="#38bdf8" />
          </div>
        </section>

        <section style={styles.spinePanel}>
          <button
            type="button"
            onClick={() => setIsHistoryOpen((current) => !current)}
            style={styles.historyHeader}
          >
            <div style={styles.historyTitleWrap}>
              <Swords size={16} color="var(--nexus-accent)" />
              <div>
                <div style={styles.panelTitle}>Historial rápido</div>
                <div style={styles.panelSubline}>Últimas partidas guardadas</div>
              </div>
            </div>
            <ChevronDown
              size={16}
              style={{ transform: isHistoryOpen ? "rotate(180deg)" : "rotate(0deg)", transition: "160ms" }}
            />
          </button>

          {isHistoryOpen && (
            <div style={styles.historyList}>
              {recentMatches.length === 0 ? (
                <MiniState text="Todavía no hay partidas registradas" />
              ) : (
                recentMatches.map((entry) => (
                  <MatchHistoryItem key={entry.id} entry={entry} />
                ))
              )}
            </div>
          )}
        </section>

        <section style={styles.spinePanel}>
          <div style={styles.panelHeaderRow}>
            <div>
              <div style={styles.panelTitle}>Beta telemetry</div>
              <div style={styles.panelSubline}>Señales útiles para testers</div>
            </div>
            <Activity size={17} color="var(--nexus-accent)" />
          </div>
          <div style={styles.telemetryList}>
            <TelemetryRow icon={Users} label="Amigos" value="Pendiente" />
            <TelemetryRow icon={Bell} label="Notificaciones" value="Próximamente" />
            <TelemetryRow icon={Shield} label="Anti-smurf" value="Planificado" />
            {socketStatus === "reconnecting" && (
              <TelemetryRow icon={Zap} label="Realtime" value={`${reconnectAttempts} reintentos`} warn />
            )}
            {socketStatus === "error" && lastError && (
              <div style={styles.errorNote}>{lastError}</div>
            )}
          </div>
        </section>
      </aside>
    </div>
  );
}

function isNavActive(pathname: string, item: NavItem) {
  if (!item.to) return false;
  if (item.to === "/profile") return pathname === "/profile" || pathname.startsWith("/profile/");
  return pathname === item.to;
}

function getSocketMeta(status: string) {
  if (status === "connected") return { label: "Online", color: "#4ade80" };
  if (status === "connecting") return { label: "Conectando", color: "#38bdf8" };
  if (status === "reconnecting") return { label: "Reconectando", color: "#facc15" };
  if (status === "error") return { label: "Error", color: "#fb7185" };
  return { label: "Idle", color: "#94a3b8" };
}

function RailSection({ eyebrow, children }: { eyebrow: string; children: React.ReactNode }) {
  return (
    <section style={styles.railSection}>
      <div style={styles.railEyebrow}>{eyebrow}</div>
      <div style={styles.railStack}>{children}</div>
    </section>
  );
}

function RailItem({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = item.icon;
  const content = (
    <div
      style={{
        ...styles.railItem,
        ...(active ? styles.railItemActive : {}),
        ...(item.disabled ? styles.railItemDisabled : {}),
      }}
    >
      <Icon size={17} />
      <span style={{ flex: 1 }}>{item.label}</span>
      {item.badge && <span style={styles.railBadge}>{item.badge}</span>}
    </div>
  );

  if (item.disabled || !item.to) return <div>{content}</div>;
  return (
    <Link to={item.to} style={{ textDecoration: "none" }}>
      {content}
    </Link>
  );
}

function Avatar({ username, avatar, size }: { username: string; avatar: string | null; size: number }) {
  return (
    <div style={{ ...styles.avatar, width: size, height: size }}>
      {avatar ? (
        <img src={avatar} alt={username} style={styles.avatarImage} />
      ) : (
        <span>{username.slice(0, 2).toUpperCase()}</span>
      )}
    </div>
  );
}

function RoleBadge({
  role,
  fallback,
  muted,
}: {
  role?: PlayerRole | null;
  fallback: string;
  muted?: boolean;
}) {
  const color = role ? roleAccents[role] : "rgba(232,244,255,0.25)";
  return (
    <span
      style={{
        ...styles.roleBadge,
        color: muted ? "rgba(232,244,255,0.55)" : color,
        borderColor: role ? `${color}66` : "rgba(232,244,255,0.12)",
        background: role ? `${color}18` : "rgba(255,255,255,0.03)",
      }}
    >
      {role ? ROLE_LABELS[role] : fallback}
    </span>
  );
}

function SpineStat({ label, value, tone }: { label: string; value: string | number; tone: string }) {
  return (
    <div style={styles.spineStat}>
      <div style={{ ...styles.spineStatValue, color: tone }}>{value}</div>
      <div style={styles.spineStatLabel}>{label}</div>
    </div>
  );
}

function MatchHistoryItem({ entry }: { entry: MatchHistoryEntry }) {
  const won = entry.match.winner === entry.team;
  const delta = entry.mmrDelta ?? 0;
  const deltaColor = delta >= 0 ? "#4ade80" : "#fb7185";

  return (
    <Link
      to="/match/$matchId"
      params={{ matchId: entry.match.id }}
      style={styles.historyItem}
    >
      <div style={{ ...styles.resultStamp, color: won ? "#4ade80" : "#fb7185" }}>
        {won ? "W" : "L"}
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={styles.historyMap}>{entry.match.selectedMap ?? "Mapa pendiente"}</div>
        <div style={styles.historyMeta}>
          {formatMatchDate(entry.match.createdAt)} · {entry.match.status.toLowerCase()}
        </div>
      </div>
      <div style={{ ...styles.historyDelta, color: deltaColor }}>
        {entry.mmrDelta != null ? `${delta > 0 ? "+" : ""}${delta}` : "—"}
      </div>
    </Link>
  );
}

function TelemetryRow({
  icon: Icon,
  label,
  value,
  warn,
}: {
  icon: typeof Users;
  label: string;
  value: string;
  warn?: boolean;
}) {
  return (
    <div style={styles.telemetryRow}>
      <Icon size={15} color={warn ? "#facc15" : "rgba(232,244,255,0.45)"} />
      <span>{label}</span>
      <strong style={{ color: warn ? "#facc15" : "rgba(232,244,255,0.62)" }}>{value}</strong>
    </div>
  );
}

function MiniState({ text }: { text: string }) {
  return <div style={styles.miniState}>{text}</div>;
}

const styles: Record<string, React.CSSProperties> = {
  shell: {
    minHeight: "100vh",
    display: "grid",
    gridTemplateColumns: "280px minmax(0, 1fr) 340px",
    background:
      "radial-gradient(circle at 18% 0%, rgba(0,200,255,0.10), transparent 28%), radial-gradient(circle at 100% 12%, rgba(124,77,255,0.10), transparent 30%), var(--nexus-bg)",
    color: "var(--nexus-text)",
  },
  commandRail: {
    position: "sticky",
    top: 0,
    height: "100vh",
    overflow: "auto",
    padding: "22px 16px",
    borderRight: "1px solid rgba(100,200,255,0.10)",
    background:
      "linear-gradient(180deg, rgba(6,11,20,0.96), rgba(8,12,20,0.88)), linear-gradient(90deg, rgba(0,200,255,0.07), transparent 22%)",
    boxShadow: "inset -1px 0 0 rgba(255,255,255,0.025)",
  },
  brandLockup: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    textDecoration: "none",
    color: "inherit",
    marginBottom: "22px",
  },
  brandMarkWrap: {
    width: "42px",
    height: "42px",
    display: "grid",
    placeItems: "center",
    border: "1px solid rgba(0,200,255,0.30)",
    background: "linear-gradient(135deg, rgba(0,200,255,0.18), rgba(124,77,255,0.10))",
    clipPath: "polygon(12% 0, 100% 0, 100% 78%, 82% 100%, 0 100%, 0 18%)",
  },
  brandMark: { width: "30px", height: "30px", objectFit: "contain" },
  brandName: {
    fontFamily: "var(--font-display)",
    fontSize: "20px",
    fontWeight: 800,
    letterSpacing: "2.5px",
    textTransform: "uppercase",
    lineHeight: 1,
  },
  brandSubline: {
    marginTop: "4px",
    color: "var(--nexus-muted)",
    fontSize: "10px",
    fontWeight: 800,
    letterSpacing: "1.4px",
    textTransform: "uppercase",
  },
  searchBlock: { position: "relative", marginBottom: "22px" },
  searchLabel: {
    marginBottom: "8px",
    color: "rgba(232,244,255,0.38)",
    fontFamily: "var(--font-display)",
    fontSize: "11px",
    fontWeight: 800,
    letterSpacing: "1.5px",
    textTransform: "uppercase",
  },
  searchInputWrap: {
    position: "relative",
    border: "1px solid rgba(100,200,255,0.12)",
    background: "rgba(2,6,14,0.72)",
    clipPath: "polygon(0 0, 100% 0, 100% 72%, 94% 100%, 0 100%)",
  },
  searchIcon: {
    position: "absolute",
    left: "12px",
    top: "50%",
    transform: "translateY(-50%)",
    color: "rgba(232,244,255,0.36)",
  },
  searchInput: {
    width: "100%",
    height: "42px",
    padding: "0 12px 0 36px",
    border: "none",
    outline: "none",
    background: "transparent",
    color: "var(--nexus-text)",
    fontFamily: "var(--font-body)",
    fontSize: "13px",
  },
  searchResultsPanel: {
    position: "absolute",
    zIndex: 20,
    left: 0,
    right: 0,
    top: "calc(100% + 8px)",
    padding: "8px",
    border: "1px solid rgba(100,200,255,0.18)",
    background: "rgba(6,11,20,0.98)",
    boxShadow: "0 24px 60px rgba(0,0,0,0.45)",
  },
  searchResultButton: {
    width: "100%",
    display: "flex",
    alignItems: "center",
    gap: "10px",
    padding: "9px",
    border: "1px solid transparent",
    background: "transparent",
    color: "inherit",
    textAlign: "left",
    cursor: "pointer",
  },
  searchResultName: { fontWeight: 800, fontSize: "13px", color: "var(--nexus-text)" },
  searchResultMeta: {
    marginTop: "3px",
    color: "var(--nexus-muted)",
    fontSize: "10px",
    fontWeight: 800,
    letterSpacing: "0.8px",
    textTransform: "uppercase",
  },
  railSection: { marginTop: "20px" },
  railEyebrow: {
    marginBottom: "8px",
    color: "rgba(232,244,255,0.20)",
    fontFamily: "var(--font-display)",
    fontSize: "10px",
    fontWeight: 900,
    letterSpacing: "2px",
    textTransform: "uppercase",
  },
  railStack: { display: "grid", gap: "7px" },
  railItem: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    minHeight: "40px",
    padding: "0 11px",
    border: "1px solid rgba(232,244,255,0.055)",
    borderLeft: "2px solid transparent",
    background: "rgba(255,255,255,0.025)",
    color: "rgba(232,244,255,0.62)",
    fontFamily: "var(--font-display)",
    fontSize: "13px",
    fontWeight: 800,
    letterSpacing: "1px",
    textTransform: "uppercase",
  },
  railItemActive: {
    borderColor: "rgba(0,200,255,0.42)",
    borderLeftColor: "var(--nexus-accent)",
    background: "linear-gradient(90deg, rgba(0,200,255,0.18), rgba(0,200,255,0.035))",
    color: "#e0f7ff",
    boxShadow: "0 0 22px rgba(0,200,255,0.08)",
  },
  railItemDisabled: { opacity: 0.56, cursor: "not-allowed" },
  railBadge: {
    padding: "2px 6px",
    border: "1px solid rgba(232,244,255,0.12)",
    color: "rgba(232,244,255,0.34)",
    fontSize: "9px",
    letterSpacing: "1px",
  },
  railBottom: { marginTop: "28px", display: "grid", gap: "10px" },
  discordPanel: {
    display: "grid",
    gridTemplateColumns: "auto 1fr auto",
    alignItems: "center",
    gap: "10px",
    padding: "12px",
    border: "1px solid rgba(88,101,242,0.26)",
    background: "linear-gradient(135deg, rgba(88,101,242,0.15), rgba(0,200,255,0.04))",
  },
  discordTitle: {
    color: "#c7d2fe",
    fontFamily: "var(--font-display)",
    fontWeight: 900,
    fontSize: "12px",
    letterSpacing: "1px",
    textTransform: "uppercase",
  },
  discordText: { marginTop: "2px", color: "rgba(232,244,255,0.42)", fontSize: "11px" },
  discordButton: {
    width: "30px",
    height: "30px",
    display: "grid",
    placeItems: "center",
    color: "#c7d2fe",
    border: "1px solid rgba(199,210,254,0.24)",
    textDecoration: "none",
  },
  logoutButton: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "8px",
    minHeight: "38px",
    border: "1px solid rgba(251,113,133,0.24)",
    background: "rgba(127,29,29,0.10)",
    color: "#fecdd3",
    fontFamily: "var(--font-display)",
    fontWeight: 900,
    letterSpacing: "1px",
    textTransform: "uppercase",
    cursor: "pointer",
  },
  mainStage: {
    minWidth: 0,
    height: "100vh",
    overflow: "auto",
    padding: "24px clamp(18px, 2vw, 32px)",
  },
  playerSpine: {
    height: "100vh",
    overflow: "auto",
    padding: "18px 16px",
    borderLeft: "1px solid rgba(100,200,255,0.10)",
    background:
      "linear-gradient(180deg, rgba(6,11,20,0.95), rgba(8,12,20,0.90)), linear-gradient(270deg, rgba(124,77,255,0.07), transparent 35%)",
    display: "flex",
    flexDirection: "column",
    gap: "14px",
  },
  playerCorePanel: {
    padding: "16px",
    border: "1px solid rgba(0,200,255,0.15)",
    background: "linear-gradient(180deg, rgba(17,25,39,0.92), rgba(8,12,20,0.80))",
    clipPath: "polygon(0 0, 100% 0, 100% 94%, 94% 100%, 0 100%)",
  },
  spinePanel: {
    padding: "14px",
    border: "1px solid rgba(232,244,255,0.07)",
    background: "rgba(17,25,39,0.66)",
  },
  spineTopRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "10px",
    marginBottom: "16px",
  },
  panelEyebrow: {
    color: "rgba(232,244,255,0.28)",
    fontFamily: "var(--font-display)",
    fontSize: "10px",
    fontWeight: 900,
    letterSpacing: "1.8px",
    textTransform: "uppercase",
  },
  panelTitle: {
    color: "var(--nexus-text)",
    fontFamily: "var(--font-display)",
    fontSize: "15px",
    fontWeight: 900,
    letterSpacing: "1.2px",
    textTransform: "uppercase",
  },
  panelSubline: { marginTop: "2px", color: "var(--nexus-muted)", fontSize: "11px" },
  connectionPill: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
    padding: "5px 8px",
    border: "1px solid",
    color: "rgba(232,244,255,0.68)",
    fontSize: "10px",
    fontWeight: 900,
    textTransform: "uppercase",
    letterSpacing: "0.8px",
  },
  connectionDot: { width: "7px", height: "7px", borderRadius: "999px" },
  identityBlock: { display: "flex", alignItems: "center", gap: "14px" },
  levelOrb: {
    position: "relative",
    width: "86px",
    height: "86px",
    display: "grid",
    placeItems: "center",
    border: "1px solid",
    borderRadius: "999px",
    flexShrink: 0,
  },
  levelChip: {
    position: "absolute",
    right: "-4px",
    bottom: "2px",
    minWidth: "28px",
    height: "28px",
    display: "grid",
    placeItems: "center",
    borderRadius: "999px",
    border: "1px solid",
    background: "rgba(2,6,14,0.96)",
    fontFamily: "var(--font-display)",
    fontSize: "15px",
    fontWeight: 900,
  },
  avatar: {
    display: "grid",
    placeItems: "center",
    overflow: "hidden",
    borderRadius: "999px",
    background: "linear-gradient(135deg, rgba(0,200,255,0.20), rgba(124,77,255,0.18))",
    color: "var(--nexus-accent)",
    fontFamily: "var(--font-display)",
    fontWeight: 900,
  },
  avatarImage: { width: "100%", height: "100%", objectFit: "cover" },
  username: {
    color: "var(--nexus-text)",
    fontFamily: "var(--font-display)",
    fontSize: "23px",
    fontWeight: 900,
    lineHeight: 1,
  },
  rankLine: {
    marginTop: "6px",
    color: "rgba(232,244,255,0.56)",
    fontSize: "12px",
    fontWeight: 800,
    letterSpacing: "1px",
    textTransform: "uppercase",
  },
  roleRow: { marginTop: "10px", display: "flex", flexWrap: "wrap", gap: "6px" },
  roleBadge: {
    padding: "4px 7px",
    border: "1px solid",
    fontFamily: "var(--font-display)",
    fontSize: "10px",
    fontWeight: 900,
    letterSpacing: "0.9px",
    textTransform: "uppercase",
  },
  progressHeader: {
    marginTop: "18px",
    display: "flex",
    justifyContent: "space-between",
    color: "rgba(232,244,255,0.42)",
    fontSize: "11px",
    fontWeight: 900,
    letterSpacing: "1px",
    textTransform: "uppercase",
  },
  progressTrack: {
    position: "relative",
    height: "10px",
    marginTop: "8px",
    overflow: "hidden",
    border: "1px solid rgba(232,244,255,0.07)",
    background: "rgba(2,6,14,0.8)",
  },
  progressFill: { position: "absolute", inset: "0 auto 0 0" },
  progressGrid: {
    position: "absolute",
    inset: 0,
    backgroundImage: "linear-gradient(90deg, rgba(2,6,14,0.35) 1px, transparent 1px)",
    backgroundSize: "14px 100%",
  },
  statsGrid: { marginTop: "14px", display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "8px" },
  spineStat: {
    padding: "10px 8px",
    textAlign: "center",
    border: "1px solid rgba(232,244,255,0.06)",
    background: "rgba(255,255,255,0.025)",
  },
  spineStatValue: { fontFamily: "var(--font-display)", fontSize: "18px", fontWeight: 900, lineHeight: 1 },
  spineStatLabel: {
    marginTop: "4px",
    color: "rgba(232,244,255,0.30)",
    fontSize: "10px",
    fontWeight: 900,
    letterSpacing: "1px",
    textTransform: "uppercase",
  },
  historyHeader: {
    width: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "12px",
    border: "none",
    background: "transparent",
    color: "inherit",
    cursor: "pointer",
    padding: 0,
    textAlign: "left",
  },
  historyTitleWrap: { display: "flex", alignItems: "center", gap: "9px" },
  historyList: { marginTop: "12px", display: "grid", gap: "8px" },
  historyItem: {
    display: "grid",
    gridTemplateColumns: "34px minmax(0, 1fr) auto",
    alignItems: "center",
    gap: "10px",
    padding: "9px",
    textDecoration: "none",
    color: "inherit",
    border: "1px solid rgba(232,244,255,0.055)",
    background: "rgba(2,6,14,0.34)",
  },
  resultStamp: {
    height: "28px",
    display: "grid",
    placeItems: "center",
    border: "1px solid rgba(232,244,255,0.08)",
    fontFamily: "var(--font-display)",
    fontSize: "14px",
    fontWeight: 900,
  },
  historyMap: { color: "var(--nexus-text)", fontSize: "12px", fontWeight: 800, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
  historyMeta: { marginTop: "2px", color: "rgba(232,244,255,0.28)", fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.8px" },
  historyDelta: { fontFamily: "var(--font-display)", fontSize: "14px", fontWeight: 900 },
  panelHeaderRow: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px" },
  telemetryList: { marginTop: "12px", display: "grid", gap: "8px" },
  telemetryRow: {
    display: "grid",
    gridTemplateColumns: "auto 1fr auto",
    alignItems: "center",
    gap: "8px",
    color: "rgba(232,244,255,0.42)",
    fontSize: "12px",
  },
  errorNote: {
    padding: "8px",
    border: "1px solid rgba(251,113,133,0.28)",
    color: "#fecdd3",
    background: "rgba(127,29,29,0.12)",
    fontSize: "11px",
  },
  miniState: {
    padding: "12px 10px",
    border: "1px dashed rgba(232,244,255,0.10)",
    color: "rgba(232,244,255,0.30)",
    textAlign: "center",
    fontFamily: "var(--font-display)",
    fontSize: "11px",
    fontWeight: 900,
    letterSpacing: "1px",
    textTransform: "uppercase",
  },
};
