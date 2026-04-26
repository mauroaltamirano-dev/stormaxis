import { useEffect, useMemo, useState } from "react";
import {
  Outlet,
  Link,
  useNavigate,
  useRouterState,
} from "@tanstack/react-router";
import {
  BarChart3,
  ChevronRight,
  ExternalLink,
  LogOut,
  Newspaper,
  Search,
  Settings,
  Shield,
  Swords,
  Trophy,
  User,
  Users,
  Sparkles,
} from "lucide-react";
import { useAuthStore } from "../stores/auth.store";
import { api } from "../lib/api";
import { getSocket } from "../lib/socket";
import { useSocketStore } from "../stores/socket.store";
import { useMatchmakingStore } from "../stores/matchmaking.store";
import { getRoleIconSources, getRoleMeta } from "../lib/roles";
import { getLevelMeta, getRankMeta } from "../lib/ranks";
import {
  getMatchLifecycleMeta,
  getQueueLifecycleMeta,
  type MatchLifecycleStatus,
} from "../lib/competitiveStatus";
import { MAP_ID_BY_NAME } from "@nexusgg/shared";
import { getCountryFlag } from "../lib/countries";

type SearchResult = {
  id: string;
  username: string;
  avatar: string | null;
  mmr: number;
  wins: number;
  losses: number;
  mainRole?: PlayerRole | null;
  secondaryRole?: PlayerRole | null;
  countryCode?: string | null;
  level?: number;
  displayLevel?: string;
};

type PlayerRole = "RANGED" | "HEALER" | "OFFLANE" | "FLEX" | "TANK";

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
  { label: "Estadísticas", icon: BarChart3, to: "/stats", badge: "beta" },
  { label: "Hero Lab", icon: Sparkles, to: "/heroes", badge: "beta" },
  { label: "Noticias", icon: Newspaper, disabled: true, badge: "discord" },
];

const accountNav: NavItem[] = [
  { label: "Mi perfil", icon: User, to: "/profile" },
  { label: "Configuración", icon: Settings, disabled: true, badge: "soon" },
];

function formatMatchDate(value: string) {
  return new Date(value).toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "2-digit",
  });
}

function formatMatchRelativeTime(value: string) {
  const diffMs = Date.now() - new Date(value).getTime();
  const minutes = Math.max(1, Math.floor(diffMs / 60_000));
  if (minutes < 60) return `${minutes} min atrás`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h atrás`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} d atrás`;
  return formatMatchDate(value);
}

function getMatchMapImage(selectedMap: string | null) {
  if (!selectedMap) return null;
  const mapId = MAP_ID_BY_NAME[selectedMap];
  return mapId ? `/maps/${mapId}.webp` : null;
}

function formatQueueTime(seconds: number) {
  const minutes = Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0");
  const rest = (seconds % 60).toString().padStart(2, "0");
  return `${minutes}:${rest}`;
}

export function AppLayout() {
  const { user, accessToken, logout } = useAuthStore();
  const {
    status: socketStatus,
  } = useSocketStore();
  const {
    status: matchmakingStatus,
    searchStartedAt,
    pendingMatch,
    queuePosition,
    queueEtaSeconds,
    resetMatchmaking,
  } = useMatchmakingStore();
  const navigate = useNavigate();
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });

  const [recentMatches, setRecentMatches] = useState<MatchHistoryEntry[]>([]);
  const [activeSpinePanel, setActiveSpinePanel] = useState<
    "history" | "friends" | null
  >(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [queueElapsed, setQueueElapsed] = useState(0);
  const [activeMatchSnapshot, setActiveMatchSnapshot] = useState<{
    id: string;
    status: MatchLifecycleStatus;
    readyCount: number;
    totalPlayers: number;
  } | null>(null);
  const primaryNavItems = useMemo(
    () =>
      user?.role === "ADMIN"
        ? [...primaryNav, { label: "Admin", icon: Shield, to: "/admin" }]
        : primaryNav,
    [user?.role],
  );

  const levelMeta = useMemo(() => getLevelMeta(user?.mmr ?? 0), [user?.mmr]);
  const level = levelMeta.level;
  const rankMeta = getRankMeta(level);
  const rankColor = rankMeta.color;
  const pointsToNextLevel =
    !user || levelMeta.nextLevelAt == null
      ? 0
      : Math.max(0, levelMeta.nextLevelAt - user.mmr);
  const socketMeta = getSocketMeta(socketStatus);
  const isSearchingMatch = matchmakingStatus === "searching";
  const isMatchFound =
    matchmakingStatus === "found" || matchmakingStatus === "accepting";
  const hasTrackedActiveMatch = Boolean(
    activeMatchSnapshot &&
    ["VETOING", "PLAYING", "VOTING", "COMPLETED", "CANCELLED"].includes(
      activeMatchSnapshot.status,
    ),
  );

  useEffect(() => {
    if (!isSearchingMatch || !searchStartedAt) {
      setQueueElapsed(0);
      return;
    }

    const tick = () => {
      setQueueElapsed(
        Math.max(0, Math.floor((Date.now() - searchStartedAt) / 1000)),
      );
    };
    tick();
    const interval = window.setInterval(tick, 1000);
    return () => window.clearInterval(interval);
  }, [isSearchingMatch, searchStartedAt]);

  useEffect(() => {
    if (!user?.username) return;

    api
      .get<MatchHistoryEntry[]>(`/users/${user.username}/matches`)
      .then(({ data }) => setRecentMatches(data.slice(0, 6)))
      .catch(() => setRecentMatches([]));
  }, [user?.username]);

  useEffect(() => {
    const socket = getSocket();
    const onCancelled = () => {
      resetMatchmaking();
    };

    socket.on("matchmaking:cancelled", onCancelled);
    return () => {
      socket.off("matchmaking:cancelled", onCancelled);
    };
  }, [resetMatchmaking]);

  useEffect(() => {
    if (!user) return;

    let cancelled = false;

    async function loadActiveMatchSnapshot() {
      try {
        const { data } = await api.get<{ match: any | null }>(
          "/matchmaking/active",
        );
        if (cancelled) return;

        const match = data.match;
        if (!match) {
          setActiveMatchSnapshot(null);
          return;
        }

        const readyCount = match.runtime?.ready?.readyBy?.length ?? 0;
        const totalPlayers =
          match.runtime?.ready?.totalPlayers ??
          match.players?.filter((player: any) => !player?.isBot).length ??
          10;

        setActiveMatchSnapshot({
          id: match.id,
          status: match.status,
          readyCount,
          totalPlayers,
        });
      } catch {
        if (!cancelled) setActiveMatchSnapshot(null);
      }
    }

    loadActiveMatchSnapshot();
    const interval = window.setInterval(loadActiveMatchSnapshot, 5000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [pathname, user]);

  useEffect(() => {
    if (!user) return;

    let cancelled = false;

    api
      .get<{
        inQueue: boolean;
        joinedAt?: number;
        queueSize?: number;
      }>("/matchmaking/queue/status")
      .then(({ data }) => {
        if (cancelled) return;

        if (!data.inQueue) {
          const hasPendingAccept =
            Boolean(pendingMatch) ||
            activeMatchSnapshot?.status === "ACCEPTING";
          const hasTransientQueueState =
            matchmakingStatus === "searching" ||
            matchmakingStatus === "found" ||
            matchmakingStatus === "accepting";

          if (!hasPendingAccept && hasTransientQueueState) {
            resetMatchmaking();
          }
          return;
        }

        if (data.queueSize != null) {
          useMatchmakingStore.getState().setQueueSize(data.queueSize);
        }

        if (matchmakingStatus === "idle") {
          useMatchmakingStore
            .getState()
            .startSearching(data.joinedAt ?? Date.now());
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [
    activeMatchSnapshot?.status,
    matchmakingStatus,
    pathname,
    pendingMatch,
    resetMatchmaking,
    user,
  ]);

  const railStatusMeta = activeMatchSnapshot
    ? getMatchLifecycleMeta(
        activeMatchSnapshot.status,
        activeMatchSnapshot.readyCount === activeMatchSnapshot.totalPlayers,
      )
    : getQueueLifecycleMeta({
        hasActiveMatch: false,
        isAccepting: isMatchFound,
        isSearching: isSearchingMatch,
        queueEtaSeconds,
        queuePosition,
        acceptedCount: pendingMatch?.acceptedBy?.length ?? 0,
        totalPlayers:
          pendingMatch?.totalPlayers ??
          (pendingMatch?.teams.team1.length ?? 0) +
            (pendingMatch?.teams.team2.length ?? 0),
      });

  useEffect(() => {
    if (!accessToken) return;

    const shouldCleanup =
      matchmakingStatus === "searching" ||
      matchmakingStatus === "found" ||
      matchmakingStatus === "accepting";

    if (!shouldCleanup) return;

    const handleLifecycleExit = () => {
      void fetch("/api/matchmaking/session/cleanup", {
        method: "POST",
        keepalive: true,
        credentials: "include",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }).catch(() => {});
    };

    window.addEventListener("pagehide", handleLifecycleExit);
    window.addEventListener("beforeunload", handleLifecycleExit);

    return () => {
      window.removeEventListener("pagehide", handleLifecycleExit);
      window.removeEventListener("beforeunload", handleLifecycleExit);
    };
  }, [accessToken, matchmakingStatus]);

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

  function openOwnProfile() {
    navigate({ to: "/profile" });
  }

  if (!user) return null;

  return (
    <div style={styles.shell}>
      <aside style={styles.commandRail}>
        <Link to="/dashboard" style={styles.brandLockup}>
          <img
            src="/brand/logo.webp"
            alt="NexusGG"
            decoding="async"
            style={styles.brandMark}
          />
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
                    <Avatar
                      username={player.username}
                      avatar={player.avatar}
                      size={32}
                    />
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={styles.searchResultName}>
                        {player.username}
                      </div>
                      <div style={styles.searchResultMeta}>
                        {player.displayLevel ??
                          getRankMeta(
                            player.level ?? getLevelMeta(player.mmr).level,
                          ).label}{" "}
                        · {player.mmr} MMR
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
          {primaryNavItems.map((item) => (
            <RailItem
              key={item.label}
              item={item}
              active={isNavActive(pathname, item)}
              queueState={
                item.to === "/dashboard" &&
                (isSearchingMatch || isMatchFound || hasTrackedActiveMatch)
                  ? {
                      status: railStatusMeta.phase,
                      label: railStatusMeta.navLabel,
                      detail: railStatusMeta.navDetail,
                      elapsed: queueElapsed,
                      position: queuePosition,
                      etaSeconds: queueEtaSeconds,
                    }
                  : undefined
              }
            />
          ))}
        </RailSection>

        <RailSection eyebrow="Cuenta">
          {accountNav.map((item) => (
            <RailItem
              key={item.label}
              item={item}
              active={isNavActive(pathname, item)}
            />
          ))}
        </RailSection>

        <div style={styles.railBottom}>
          <div style={styles.discordPanel}>
            <DiscordIcon />
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

          <button
            type="button"
            onClick={handleLogout}
            style={styles.logoutButton}
          >
            <LogOut size={15} />
            Cerrar sesión
          </button>
        </div>
      </aside>

      <main style={styles.mainStage}>
        <Outlet />
      </main>

      {activeSpinePanel === "history" && (
        <SpineFlyout
          title="Historial rápido"
          subtitle="Últimas partidas guardadas"
          icon={<Swords size={17} />}
          onClose={() => setActiveSpinePanel(null)}
        >
          <div style={styles.historyList}>
            {recentMatches.length === 0 ? (
              <MiniState text="Todavía no hay partidas registradas" />
            ) : (
              recentMatches.map((entry) => (
                <MatchHistoryItem key={entry.id} entry={entry} />
              ))
            )}
          </div>
        </SpineFlyout>
      )}

      {activeSpinePanel === "friends" && (
        <SpineFlyout
          title="Amigos"
          subtitle="Estado social competitivo"
          icon={<Users size={17} />}
          onClose={() => setActiveSpinePanel(null)}
        >
          <div style={styles.friendStatusStack}>
            <FriendStatusRow label="Conectado" tone="#4ade80" detail="Disponible para premade" />
            <FriendStatusRow label="Jugando" tone="#38bdf8" detail="En partida activa" />
            <FriendStatusRow label="Offline" tone="rgba(148,163,184,0.75)" detail="Sin conexión" />
          </div>
          <MiniState text="La lista real de amigos queda preparada para la próxima integración social." />
        </SpineFlyout>
      )}

      <aside style={styles.playerSpine}>
        <button
          type="button"
          onClick={openOwnProfile}
          style={styles.compactIdentityButton}
          aria-label="Abrir mi perfil"
        >
          <div style={styles.compactAvatarWrap}>
            <Avatar username={user.username} avatar={user.avatar} size={58} />
            <img
              src={rankMeta.iconSrc}
              alt={rankMeta.label}
              loading="lazy"
              decoding="async"
              style={{
                ...styles.compactRankIcon,
                filter: `drop-shadow(0 0 10px ${rankColor})`,
              }}
            />
          </div>

          <div style={{ ...styles.compactRankLabel, color: rankColor }}>
            {rankMeta.label}
          </div>
          <div style={styles.compactMmrLine}>
            {user.mmr.toLocaleString("es-AR")} MMR
          </div>
          <div style={{ ...styles.nextMmrPill, borderColor: `${rankColor}44`, color: rankColor }}>
            {levelMeta.nextLevelAt == null ? "MAX" : `+${pointsToNextLevel}`}
          </div>

          <div style={styles.compactNameBlock}>
            <div style={styles.compactNameRow}>
              <span style={styles.spineNameFlag} title="Nacionalidad">
                {getCountryFlag(user.countryCode)}
              </span>
              <span style={styles.compactName}>{user.username}</span>
            </div>
            {user.bnetBattletag ? (
              <BattleNetMiniTag battletag={user.bnetBattletag} compact />
            ) : (
              <span style={styles.compactBattletag}>NexusGG · SA</span>
            )}
          </div>
        </button>

        <div style={styles.compactRoleStack}>
          <RoleBadge
            role={user.mainRole as PlayerRole | null | undefined}
            fallback="Main"
            compact
          />
          <RoleBadge
            role={user.secondaryRole as PlayerRole | null | undefined}
            fallback="Alt"
            muted
            compact
          />
        </div>

        <div style={styles.spineActionStack}>
          <SpineActionButton
            label="Historial"
            active={activeSpinePanel === "history"}
            onClick={() =>
              setActiveSpinePanel((current) =>
                current === "history" ? null : "history",
              )
            }
          >
            <Swords size={20} />
          </SpineActionButton>
          <SpineActionButton
            label="Amigos"
            active={activeSpinePanel === "friends"}
            onClick={() =>
              setActiveSpinePanel((current) =>
                current === "friends" ? null : "friends",
              )
            }
          >
            <Users size={20} />
          </SpineActionButton>
        </div>

        <div
          style={{
            ...styles.compactConnectionDot,
            background: socketMeta.color,
            boxShadow: `0 0 14px ${socketMeta.color}`,
          }}
          title={socketMeta.label}
        />
      </aside>
    </div>
  );
}

function isNavActive(pathname: string, item: NavItem) {
  if (!item.to) return false;
  if (item.to === "/profile")
    return pathname === "/profile" || pathname.startsWith("/profile/");
  return pathname === item.to;
}

function getSocketMeta(status: string) {
  if (status === "connected") return { label: "Online", color: "#4ade80" };
  if (status === "connecting") return { label: "Conectando", color: "#38bdf8" };
  if (status === "reconnecting")
    return { label: "Reconectando", color: "#facc15" };
  if (status === "error") return { label: "Error", color: "#fb7185" };
  return { label: "Idle", color: "#94a3b8" };
}

function RailSection({
  eyebrow,
  children,
}: {
  eyebrow: string;
  children: React.ReactNode;
}) {
  return (
    <section style={styles.railSection}>
      <div style={styles.railEyebrow}>{eyebrow}</div>
      <div style={styles.railStack}>{children}</div>
    </section>
  );
}

function RailItem({
  item,
  active,
  queueState,
}: {
  item: NavItem;
  active: boolean;
  queueState?: {
    status: string;
    label: string;
    detail: string;
    elapsed: number;
    position: number | null;
    etaSeconds: number | null;
  };
}) {
  const Icon = item.icon;
  const hasQueueState = Boolean(queueState);
  const content = (
    <div
      style={{
        ...styles.railItem,
        ...(active ? styles.railItemActive : {}),
        ...(hasQueueState ? styles.railItemSearching : {}),
        ...(item.disabled ? styles.railItemDisabled : {}),
      }}
    >
      <Icon size={17} />
      <span style={{ flex: 1 }}>{item.label}</span>
      {queueState && (
        <span style={styles.queueNavPulseWrap}>
          <span style={styles.queueNavPulse} />
          {queueState.label}
        </span>
      )}
      {item.badge && <span style={styles.railBadge}>{item.badge}</span>}
      {queueState && (
        <div style={styles.queueNavMeta}>
          <span>
            {queueState.status === "EN COLA"
              ? formatQueueTime(queueState.elapsed)
              : queueState.label}
          </span>
          <span>{queueState.detail}</span>
        </div>
      )}
    </div>
  );

  if (item.disabled || !item.to) return <div>{content}</div>;
  return (
    <Link to={item.to} style={{ textDecoration: "none" }}>
      {content}
    </Link>
  );
}

function BattleNetMiniTag({
  battletag,
  compact,
}: {
  battletag: string;
  compact?: boolean;
}) {
  return (
    <div
      title="Battle.net ID vinculado"
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: "5px",
        minWidth: 0,
        color: "#9bd8ff",
        fontSize: compact ? "8.5px" : "9.5px",
        fontWeight: 900,
        letterSpacing: compact ? "0.6px" : "1px",
        textTransform: "uppercase",
      }}
    >
      <span
        style={{
          width: "5px",
          height: "5px",
          borderRadius: "999px",
          background: "#00aeff",
          boxShadow: "0 0 9px #00aeff",
          flexShrink: 0,
        }}
      />
      <span style={{ color: "rgba(155,216,255,0.50)" }}>B.NET</span>
      <span
        style={{
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          maxWidth: compact ? "74px" : "150px",
          color: "#d8f2ff",
        }}
      >
        {battletag}
      </span>
    </div>
  );
}

function Avatar({
  username,
  avatar,
  size,
}: {
  username: string;
  avatar: string | null;
  size: number;
}) {
  return (
    <div style={{ ...styles.avatar, width: size, height: size }}>
      {avatar ? (
        <img
          src={avatar}
          alt={username}
          loading="lazy"
          decoding="async"
          style={styles.avatarImage}
        />
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
  compact,
}: {
  role?: PlayerRole | null;
  fallback: string;
  muted?: boolean;
  compact?: boolean;
}) {
  const meta = getRoleMeta(role);
  const iconSources = getRoleIconSources(role);
  const color = meta?.accent ?? "rgba(232,244,255,0.25)";
  return (
    <span
      style={{
        ...styles.roleBadge,
        ...(compact ? styles.roleBadgeCompact : {}),
        color: muted ? "rgba(232,244,255,0.55)" : color,
        borderColor: role ? `${color}66` : "rgba(232,244,255,0.12)",
        background: role ? `${color}18` : "rgba(255,255,255,0.03)",
      }}
    >
      {meta && (
        <img
          src={iconSources?.primary}
          alt=""
          loading="lazy"
          decoding="async"
          onError={(event) => {
            if (
              !iconSources?.fallback ||
              event.currentTarget.dataset.fallbackApplied === "1"
            )
              return;
            event.currentTarget.dataset.fallbackApplied = "1";
            event.currentTarget.src = iconSources.fallback;
          }}
          style={{
            width: compact ? "14px" : "15px",
            height: compact ? "14px" : "15px",
            objectFit: "contain",
            filter: `drop-shadow(0 0 5px ${color}66)`,
          }}
        />
      )}
      {compact ? (meta ? meta.label.slice(0, 4) : fallback) : meta ? meta.label : fallback}
    </span>
  );
}

function MatchHistoryItem({ entry }: { entry: MatchHistoryEntry }) {
  const won = entry.match.winner === entry.team;
  const delta = entry.mmrDelta ?? 0;
  const deltaColor = delta >= 0 ? "#4ade80" : "#fb7185";
  const resultColor = won ? "#4ade80" : "#fb7185";
  const mapImage = getMatchMapImage(entry.match.selectedMap);

  return (
    <Link
      to="/match/$matchId"
      params={{ matchId: entry.match.id }}
      style={styles.historyItem}
    >
      <div style={styles.historyThumb}>
        {mapImage ? (
          <img
            src={mapImage}
            alt=""
            style={styles.historyThumbImage}
            loading="lazy"
            decoding="async"
          />
        ) : (
          <div style={styles.historyThumbFallback}>
            {entry.match.selectedMap?.slice(0, 2).toUpperCase() ?? "?"}
          </div>
        )}
        <div
          style={{
            ...styles.historyThumbShade,
            boxShadow: `inset 0 0 0 1px ${resultColor}26`,
          }}
        />
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={styles.historyMap}>
          {entry.match.selectedMap ?? "Mapa pendiente"}
        </div>
        <div style={{ ...styles.historyMeta, color: resultColor }}>
          {won ? "Victoria" : "Derrota"}
          <span style={styles.historyTime}>
            {" "}
            · {formatMatchRelativeTime(entry.match.createdAt)}
          </span>
        </div>
      </div>
      <div style={{ ...styles.historyDelta, color: deltaColor }}>
        {entry.mmrDelta != null ? `${delta > 0 ? "+" : ""}${delta} ELO` : "—"}
      </div>
    </Link>
  );
}

function SpineFlyout({
  title,
  subtitle,
  icon,
  children,
  onClose,
}: {
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <section style={styles.spineFlyout}>
      <div style={styles.flyoutHeader}>
        <div style={styles.historyTitleWrap}>
          <span style={styles.flyoutIcon}>{icon}</span>
          <div>
            <div style={styles.panelTitle}>{title}</div>
            <div style={styles.panelSubline}>{subtitle}</div>
          </div>
        </div>
        <button type="button" onClick={onClose} style={styles.flyoutClose}>
          ×
        </button>
      </div>
      {children}
    </section>
  );
}

function SpineActionButton({
  label,
  active,
  children,
  onClick,
}: {
  label: string;
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      style={{
        ...styles.spineActionButton,
        ...(active ? styles.spineActionButtonActive : {}),
      }}
    >
      {children}
    </button>
  );
}

function FriendStatusRow({
  label,
  tone,
  detail,
}: {
  label: string;
  tone: string;
  detail: string;
}) {
  return (
    <div style={styles.friendStatusRow}>
      <span
        style={{
          ...styles.friendStatusDot,
          background: tone,
          boxShadow: `0 0 12px ${tone}`,
        }}
      />
      <div>
        <strong style={{ color: tone }}>{label}</strong>
        <span>{detail}</span>
      </div>
    </div>
  );
}

function MiniState({ text }: { text: string }) {
  return <div style={styles.miniState}>{text}</div>;
}

function DiscordIcon() {
  return (
    <svg
      aria-hidden="true"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      style={{ flexShrink: 0 }}
    >
      <path
        fill="#a5b4fc"
        d="M19.54 5.34A17.3 17.3 0 0 0 15.23 4c-.19.34-.4.8-.55 1.16a16.1 16.1 0 0 0-5.36 0A9.8 9.8 0 0 0 8.77 4c-1.5.26-2.95.72-4.31 1.34C1.73 9.42 1 13.4 1.37 17.32A17.5 17.5 0 0 0 6.65 20c.42-.58.8-1.2 1.12-1.86-.62-.23-1.2-.52-1.76-.86.15-.11.3-.23.44-.35a12.4 12.4 0 0 0 11.1 0l.44.35c-.56.34-1.14.63-1.76.86.32.66.7 1.28 1.12 1.86a17.45 17.45 0 0 0 5.28-2.68c.44-4.55-.75-8.5-3.09-11.98ZM8.67 14.9c-1.03 0-1.88-.94-1.88-2.1 0-1.16.83-2.1 1.88-2.1s1.9.95 1.88 2.1c0 1.16-.83 2.1-1.88 2.1Zm6.66 0c-1.03 0-1.88-.94-1.88-2.1 0-1.16.83-2.1 1.88-2.1s1.9.95 1.88 2.1c0 1.16-.83 2.1-1.88 2.1Z"
      />
    </svg>
  );
}

const styles: Record<string, React.CSSProperties> = {
  shell: {
    minHeight: "100vh",
    display: "grid",
    gridTemplateColumns: "238px minmax(0, 1fr) 104px",
    background:
      "radial-gradient(circle at 18% 0%, rgba(0,200,255,0.10), transparent 28%), radial-gradient(circle at 100% 12%, rgba(124,77,255,0.10), transparent 30%), var(--nexus-bg)",
    color: "var(--nexus-text)",
  },
  commandRail: {
    position: "sticky",
    top: 0,
    height: "100vh",
    overflow: "auto",
    padding: "20px 12px",
    borderRight: "1px solid rgba(100,200,255,0.10)",
    background:
      "linear-gradient(180deg, rgba(6,11,20,0.96), rgba(8,12,20,0.88)), linear-gradient(90deg, rgba(0,200,255,0.07), transparent 22%)",
    boxShadow: "inset -1px 0 0 rgba(255,255,255,0.025)",
  },
  brandLockup: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    textDecoration: "none",
    color: "inherit",
    marginBottom: "22px",
  },
  brandMarkWrap: {
    width: "78px",
    height: "78px",
    display: "grid",
    placeItems: "center",
    border: "1px solid rgba(0,200,255,0.30)",
    background:
      "linear-gradient(135deg, rgba(0,200,255,0.18), rgba(124,77,255,0.10))",
    clipPath: "polygon(12% 0, 100% 0, 100% 78%, 82% 100%, 0 100%, 0 18%)",
  },
  brandMark: { width: "42px", height: "42px", objectFit: "contain" },
  brandName: {
    fontFamily: "var(--font-display)",
    fontSize: "16px",
    fontWeight: 800,
    letterSpacing: "2px",
    textTransform: "uppercase",
    lineHeight: 1,
  },
  brandSubline: {
    marginTop: "4px",
    color: "var(--nexus-muted)",
    fontSize: "9px",
    fontWeight: 800,
    letterSpacing: "1.1px",
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
    height: "40px",
    padding: "0 10px 0 34px",
    border: "none",
    outline: "none",
    background: "transparent",
    color: "var(--nexus-text)",
    fontFamily: "var(--font-body)",
    fontSize: "12px",
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
  searchResultName: {
    fontWeight: 800,
    fontSize: "13px",
    color: "var(--nexus-text)",
  },
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
    flexWrap: "wrap",
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
    background:
      "linear-gradient(90deg, rgba(0,200,255,0.18), rgba(0,200,255,0.035))",
    color: "#e0f7ff",
    boxShadow: "0 0 22px rgba(0,200,255,0.08)",
  },
  railItemSearching: {
    borderColor: "rgba(74,222,128,0.36)",
    borderLeftColor: "#4ade80",
    background:
      "linear-gradient(90deg, rgba(74,222,128,0.13), rgba(0,200,255,0.045))",
    color: "#dcfce7",
    boxShadow: "0 0 24px rgba(74,222,128,0.08)",
    paddingTop: "8px",
    paddingBottom: "8px",
  },
  railItemDisabled: { opacity: 0.56, cursor: "not-allowed" },
  railBadge: {
    padding: "2px 6px",
    border: "1px solid rgba(232,244,255,0.12)",
    color: "rgba(232,244,255,0.34)",
    fontSize: "9px",
    letterSpacing: "1px",
  },
  queueNavPulseWrap: {
    display: "inline-flex",
    alignItems: "center",
    gap: "5px",
    padding: "2px 6px",
    border: "1px solid rgba(74,222,128,0.28)",
    background: "rgba(74,222,128,0.08)",
    color: "#86efac",
    fontSize: "9px",
    fontWeight: 900,
    letterSpacing: "1px",
  },
  queueNavPulse: {
    width: "6px",
    height: "6px",
    borderRadius: "999px",
    background: "#4ade80",
    boxShadow: "0 0 10px #4ade80",
    animation: "blink 1s infinite",
  },
  queueNavMeta: {
    width: "100%",
    display: "flex",
    justifyContent: "space-between",
    gap: "8px",
    paddingLeft: "27px",
    color: "rgba(220,252,231,0.62)",
    fontSize: "10px",
    fontWeight: 800,
    letterSpacing: "0.6px",
    textTransform: "none",
  },
  railBottom: { marginTop: "28px", display: "grid", gap: "10px" },
  discordPanel: {
    display: "grid",
    gridTemplateColumns: "auto 1fr auto",
    alignItems: "center",
    gap: "10px",
    padding: "12px",
    border: "1px solid rgba(88,101,242,0.26)",
    background:
      "linear-gradient(135deg, rgba(88,101,242,0.15), rgba(0,200,255,0.04))",
  },
  discordTitle: {
    color: "#c7d2fe",
    fontFamily: "var(--font-display)",
    fontWeight: 900,
    fontSize: "12px",
    letterSpacing: "1px",
    textTransform: "uppercase",
  },
  discordText: {
    marginTop: "2px",
    color: "rgba(232,244,255,0.42)",
    fontSize: "11px",
  },
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
    overflow: "visible",
    padding: "14px 8px",
    borderLeft: "1px solid rgba(100,200,255,0.10)",
    background:
      "linear-gradient(180deg, rgba(6,11,20,0.95), rgba(8,12,20,0.90)), linear-gradient(270deg, rgba(124,77,255,0.07), transparent 35%)",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "12px",
  },
  compactIdentityButton: {
    width: "100%",
    display: "grid",
    justifyItems: "center",
    gap: "5px",
    padding: "0 2px 10px",
    border: "none",
    borderBottom: "1px solid rgba(232,244,255,0.07)",
    background: "transparent",
    color: "inherit",
    textAlign: "center",
    cursor: "pointer",
  },
  compactAvatarWrap: {
    position: "relative",
    width: "64px",
    height: "64px",
    display: "grid",
    placeItems: "center",
    padding: "3px",
    border: "1px solid rgba(0,200,255,0.18)",
    borderRadius: "999px",
    background:
      "radial-gradient(circle at 50% 15%, rgba(0,200,255,0.20), rgba(2,6,14,0.94) 62%)",
    boxShadow: "inset 0 0 18px rgba(0,200,255,0.08)",
  },
  compactRankIcon: {
    position: "absolute",
    right: "-3px",
    bottom: "-4px",
    width: "24px",
    height: "24px",
    objectFit: "contain",
  },
  compactRankLabel: {
    marginTop: "4px",
    maxWidth: "86px",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    fontFamily: "var(--font-display)",
    fontSize: "10px",
    fontWeight: 950,
    letterSpacing: "0.9px",
    textTransform: "uppercase",
    textShadow: "0 0 12px currentColor",
  },
  compactMmrLine: {
    color: "rgba(232,244,255,0.45)",
    fontFamily: "var(--font-display)",
    fontSize: "9px",
    fontWeight: 900,
    letterSpacing: "0.45px",
    whiteSpace: "nowrap",
  },
  nextMmrPill: {
    minWidth: "48px",
    padding: "2px 7px",
    border: "1px solid",
    background: "rgba(255,255,255,0.03)",
    fontFamily: "var(--font-display)",
    fontSize: "10px",
    fontWeight: 950,
    letterSpacing: "0.8px",
    textTransform: "uppercase",
  },
  compactNameBlock: {
    width: "100%",
    display: "grid",
    justifyItems: "center",
    gap: "2px",
    marginTop: "4px",
  },
  compactNameRow: {
    width: "100%",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "4px",
    minWidth: 0,
  },
  compactName: {
    minWidth: 0,
    maxWidth: "62px",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    color: "#f8fafc",
    fontFamily: "var(--font-display)",
    fontSize: "12px",
    fontWeight: 950,
    lineHeight: 1,
  },
  compactBattletag: {
    maxWidth: "82px",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    color: "rgba(232,244,255,0.32)",
    fontSize: "8.5px",
    fontWeight: 900,
    letterSpacing: "0.65px",
    textTransform: "uppercase",
  },
  compactRoleStack: {
    width: "100%",
    display: "grid",
    gap: "5px",
    justifyItems: "center",
  },
  spineActionStack: {
    width: "100%",
    display: "grid",
    gap: "10px",
    marginTop: "auto",
    paddingBottom: "12px",
  },
  spineActionButton: {
    width: "48px",
    height: "48px",
    display: "grid",
    placeItems: "center",
    justifySelf: "center",
    border: "1px solid rgba(232,244,255,0.11)",
    borderRadius: "10px",
    background:
      "linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0.025))",
    color: "rgba(232,244,255,0.72)",
    cursor: "pointer",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.05)",
  },
  spineActionButtonActive: {
    borderColor: "rgba(0,200,255,0.72)",
    color: "#e0f7ff",
    boxShadow:
      "0 0 0 1px rgba(0,200,255,0.16), 0 0 22px rgba(0,200,255,0.18)",
  },
  compactConnectionDot: {
    width: "7px",
    height: "7px",
    borderRadius: "999px",
    marginBottom: "4px",
  },
  spineFlyout: {
    position: "fixed",
    top: "16px",
    right: "116px",
    bottom: "16px",
    zIndex: 35,
    width: "min(338px, calc(100vw - 148px))",
    overflow: "auto",
    padding: "14px",
    border: "1px solid rgba(0,200,255,0.22)",
    background:
      "linear-gradient(180deg, rgba(8,12,20,0.98), rgba(10,16,28,0.96)), radial-gradient(circle at 0% 0%, rgba(0,200,255,0.14), transparent 28%)",
    boxShadow: "-24px 0 70px rgba(0,0,0,0.42), inset 0 1px 0 rgba(255,255,255,0.05)",
  },
  flyoutHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "12px",
    paddingBottom: "12px",
    borderBottom: "1px solid rgba(232,244,255,0.07)",
  },
  flyoutIcon: {
    width: "32px",
    height: "32px",
    display: "grid",
    placeItems: "center",
    border: "1px solid rgba(0,200,255,0.28)",
    color: "var(--nexus-accent)",
    background: "rgba(0,200,255,0.08)",
    borderRadius: "9px",
  },
  flyoutClose: {
    width: "30px",
    height: "30px",
    display: "grid",
    placeItems: "center",
    border: "1px solid rgba(232,244,255,0.12)",
    background: "rgba(255,255,255,0.025)",
    color: "rgba(232,244,255,0.72)",
    fontSize: "20px",
    lineHeight: 1,
    cursor: "pointer",
  },
  friendStatusStack: {
    display: "grid",
    gap: "8px",
    marginTop: "12px",
    marginBottom: "12px",
  },
  friendStatusRow: {
    display: "grid",
    gridTemplateColumns: "auto 1fr",
    alignItems: "center",
    gap: "10px",
    padding: "10px",
    border: "1px solid rgba(232,244,255,0.07)",
    background: "rgba(255,255,255,0.025)",
  },
  friendStatusDot: {
    width: "8px",
    height: "8px",
    borderRadius: "999px",
  },
  playerSpineCollapsed: {
    padding: "14px 8px",
    alignItems: "center",
    overflow: "hidden",
    gap: "12px",
  },
  spineCollapseButton: {
    minHeight: "34px",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "7px",
    border: "1px solid rgba(100,200,255,0.16)",
    background: "rgba(2,6,14,0.72)",
    color: "rgba(232,244,255,0.62)",
    fontFamily: "var(--font-display)",
    fontSize: "10px",
    fontWeight: 900,
    letterSpacing: "1.1px",
    textTransform: "uppercase",
    cursor: "pointer",
  },
  spineCollapseButtonCompact: {
    width: "42px",
    padding: 0,
  },
  collapsedSpineStack: {
    width: "100%",
    display: "grid",
    justifyItems: "center",
    gap: "12px",
  },
  collapsedAvatarButton: {
    width: "44px",
    height: "44px",
    display: "grid",
    placeItems: "center",
    padding: "2px",
    border: "1px solid",
    background: "rgba(2,6,14,0.74)",
    cursor: "pointer",
  },
  collapsedRankRail: {
    width: "36px",
    minHeight: "50px",
    display: "grid",
    placeItems: "center",
    border: "1px solid",
    background: "rgba(255,255,255,0.025)",
    fontFamily: "var(--font-display)",
    fontSize: "18px",
    fontWeight: 900,
  },
  collapsedConnectionDot: {
    width: "9px",
    height: "9px",
    borderRadius: "999px",
  },
  collapsedQueueGlyph: {
    width: "36px",
    height: "36px",
    display: "grid",
    placeItems: "center",
    border: "1px solid rgba(74,222,128,0.32)",
    background: "rgba(74,222,128,0.10)",
    color: "#86efac",
  },
  playerCorePanel: {
    padding: "16px",
    border: "1px solid rgba(0,200,255,0.15)",
    background:
      "linear-gradient(180deg, rgba(17,25,39,0.92), rgba(8,12,20,0.80))",
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
    color: "rgba(194, 194, 194, 0.623)",
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
  panelSubline: {
    marginTop: "2px",
    color: "var(--nexus-muted)",
    fontSize: "11px",
  },
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
  identityButton: {
    width: "100%",
    border: "none",
    padding: 0,
    background: "transparent",
    color: "inherit",
    textAlign: "left",
    cursor: "pointer",
  },
  identityStack: {
    display: "flex",
    justifyItems: "center",
    gap: "9px",
    alignItems: "center",
  },
  identitySummary: {
    display: "grid",
    justifyItems: "center",
    textAlign: "center",
  },
  spineNameRow: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "6px",
    minWidth: 0,
    maxWidth: "100%",
    margin: "0 auto",
  },
  spineNameFlag: {
    fontSize: "13px",
    lineHeight: 1,
    filter: "drop-shadow(0 0 8px rgba(255,255,255,0.12))",
  },
  spineName: {
    minWidth: 0,
    maxWidth: "190px",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    fontFamily: "var(--font-display)",
    fontSize: "18px",
    fontWeight: 900,
    letterSpacing: "0.8px",
    color: "var(--nexus-text)",
    lineHeight: 1,
  },
  identityRankBlock: {
    display: "flex",
    alignItems: "center",
    margin: "25px 0",
    gap: "5px",
  },
  identityAvatarWrap: {
    width: "56px",
    height: "56px",
    borderRadius: "999px",
    display: "grid",
    placeItems: "center",
    flexShrink: 0,
  },
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
    background:
      "linear-gradient(135deg, rgba(0,200,255,0.20), rgba(124,77,255,0.18))",
    color: "var(--nexus-accent)",
    fontFamily: "var(--font-display)",
    fontWeight: 900,
  },
  avatarImage: { width: "100%", height: "100%", objectFit: "cover" },
  username: {
    color: "var(--nexus-text)",
    fontFamily: "var(--font-display)",
    fontSize: "24px",
    fontWeight: 900,
    lineHeight: 1,
  },
  identityRankName: {
    marginTop: "2px",
    fontFamily: "var(--font-display)",
    fontSize: "16px",
    fontWeight: 900,
    lineHeight: 1,
    letterSpacing: "1.1px",
    textTransform: "uppercase",
  },
  identityRankMmr: {
    color: "var(--nexus-text)",
    fontFamily: "var(--font-display)",
    fontSize: "12px",
    fontWeight: 900,
    letterSpacing: "1px",
    lineHeight: 1,
  },
  roleRow: {
    display: "flex",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: "8px",
  },
  roleBadge: {
    display: "inline-flex",
    alignItems: "center",
    gap: "5px",
    padding: "4px 7px",
    border: "1px solid",
    fontFamily: "var(--font-display)",
    fontSize: "10px",
    fontWeight: 900,
    letterSpacing: "0.9px",
    textTransform: "uppercase",
  },
  roleBadgeCompact: {
    width: "78px",
    justifyContent: "center",
    padding: "4px 5px",
    gap: "4px",
    fontSize: "8.5px",
    letterSpacing: "0.55px",
  },
  statsGrid: {
    marginTop: "14px",
    display: "grid",
    gridTemplateColumns: "repeat(3, 1fr)",
    gap: "8px",
  },
  adminMmrPanel: {
    marginTop: "14px",
    border: "1px solid rgba(192,132,252,0.18)",
    background:
      "linear-gradient(180deg, rgba(76,29,149,0.10), rgba(2,6,14,0.56))",
    padding: "10px",
    display: "grid",
    gap: "10px",
  },
  adminMmrHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "10px",
    color: "rgba(232,244,255,0.50)",
    fontSize: "10px",
    fontWeight: 900,
    letterSpacing: "0.12em",
    textTransform: "uppercase",
  },
  adminMmrActions: {
    display: "grid",
    gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
    gap: "6px",
  },
  adminMmrButton: {
    minHeight: "34px",
    border: "1px solid",
    fontFamily: "var(--font-display)",
    fontSize: "11px",
    fontWeight: 900,
    letterSpacing: "0.1em",
    textTransform: "uppercase",
    cursor: "pointer",
  },
  adminMmrError: {
    color: "#fecaca",
    fontSize: "11px",
    fontWeight: 700,
  },
  spineStat: {
    padding: "10px 8px",
    textAlign: "center",
    border: "1px solid rgba(232,244,255,0.06)",
    background: "rgba(255,255,255,0.025)",
  },
  spineStatValue: {
    fontFamily: "var(--font-display)",
    fontSize: "18px",
    fontWeight: 900,
    lineHeight: 1,
  },
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
    gridTemplateColumns: "54px minmax(0, 1fr) auto",
    alignItems: "center",
    gap: "10px",
    minHeight: "60px",
    padding: "7px 9px 7px 7px",
    textDecoration: "none",
    color: "inherit",
    border: "1px solid rgba(69,87,116,0.35)",
    background:
      "linear-gradient(180deg, rgba(7,14,27,0.92), rgba(3,8,18,0.94))",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.035)",
  },
  historyThumb: {
    position: "relative",
    width: "50px",
    height: "42px",
    overflow: "hidden",
    border: "1px solid rgba(232,244,255,0.08)",
    background: "rgba(2,6,14,0.65)",
  },
  historyThumbImage: {
    width: "100%",
    height: "100%",
    objectFit: "cover",
    display: "block",
  },
  historyThumbFallback: {
    width: "100%",
    height: "100%",
    display: "grid",
    placeItems: "center",
    fontFamily: "var(--font-display)",
    fontSize: "13px",
    fontWeight: 900,
    color: "rgba(232,244,255,0.45)",
  },
  historyThumbShade: {
    position: "absolute",
    inset: 0,
    background:
      "linear-gradient(135deg, rgba(255,255,255,0.08), transparent 44%, rgba(0,0,0,0.42))",
  },
  historyMap: {
    color: "var(--nexus-text)",
    fontSize: "12px",
    fontWeight: 800,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  historyMeta: {
    marginTop: "2px",
    fontSize: "10px",
    textTransform: "uppercase",
    letterSpacing: "0.8px",
    fontWeight: 900,
  },
  historyTime: {
    color: "rgba(232,244,255,0.34)",
    fontWeight: 800,
  },
  historyDelta: {
    fontFamily: "var(--font-display)",
    fontSize: "12px",
    fontWeight: 900,
    whiteSpace: "nowrap",
    letterSpacing: "0.7px",
  },
  panelHeaderRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "10px",
  },
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
