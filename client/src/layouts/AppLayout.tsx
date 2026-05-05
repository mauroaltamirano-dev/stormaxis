import { useEffect, useMemo, useRef, useState } from "react";
import { Outlet, Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { BarChart3, BookOpen, FlaskConical, LogOut, Play, Settings, Shield, Swords, Trophy, User, Users } from "lucide-react";
import { useAuthStore } from "../stores/auth.store";
import { useMatchmakingStore } from "../stores/matchmaking.store";
import { api } from "../lib/api";
import { getSocket } from "../lib/socket";
import { type MatchLifecycleStatus } from "../lib/competitiveStatus";
import { MatchFoundModal } from "../components/matchmaking/MatchFoundModal";
import { NotificationBell } from "../components/NotificationBell";
import { PlayerLink } from "../components/PlayerLink";
import { getRankMeta, parseRankLevel } from "../lib/ranks";
import "../styles/stormaxis-v2.css";

type PendingMatchPayload = NonNullable<ReturnType<typeof useMatchmakingStore.getState>["pendingMatch"]>;

type ActiveMatchResponse = {
  id: string;
  status: MatchLifecycleStatus | "ACCEPTING";
  pending?: PendingMatchPayload | null;
};

type QueueStatusResponse = {
  inQueue: boolean;
  queueSize?: number;
  joinedAt?: number;
};

type QueueSnapshotPlayer = { userId: string };
type QueueSnapshotResponse = { count: number; players: QueueSnapshotPlayer[] };
type FriendSummary = { id: string; username: string; avatar: string | null; presenceStatus?: "ONLINE" | "OFFLINE" | "IN_MATCH" };
type FriendsResponse = { friends: FriendSummary[] };
type RecentMatch = {
  id: string;
  team: number;
  match: {
    id: string;
    selectedMap: string | null;
    winner: number | null;
    createdAt: string;
  };
};
type ScrimsNavResponse = {
  myTeam: { id: string } | null;
  searches: Array<{
    teamId: string;
    status?: string;
    starterUserIds?: string[];
    coachUserId?: string | null;
    observerUserIds?: string[] | null;
  }>;
};

type NavItem = { label: string; icon: React.ReactNode; to?: string; disabled?: boolean; dividerBefore?: boolean };

const DISCORD_INVITE_URL = import.meta.env.VITE_DISCORD_INVITE || "https://discord.gg/etkGDYkMgM";

const primaryNav: NavItem[] = [
  { label: "Jugar", icon: <Play size={20} fill="currentColor" />, to: "/dashboard" },
  { label: "Equipos", icon: <Users size={21} />, to: "/teams" },
  { label: "Scrims", icon: <Swords size={21} />, to: "/scrims" },
  { label: "Heroes Lab", icon: <FlaskConical size={21} />, to: "/heroes" },
  { label: "Ranking", icon: <Trophy size={21} />, to: "/leaderboard" },
  { label: "Estadísticas", icon: <BarChart3 size={21} />, to: "/stats" },
  { label: "Noticias", icon: <BookOpen size={21} />, disabled: true },
  { label: "Perfil", icon: <User size={21} />, to: "/profile", dividerBefore: true },
  { label: "Configuración", icon: <Settings size={21} />, disabled: true },
];

export function AppLayout() {
  const { user, logout } = useAuthStore();
  const {
    pendingMatch,
    setMatchFound,
    clearPendingMatch,
    resetMatchmaking,
    status,
    searchStartedAt,
    startSearching,
    stopSearching,
    setQueueSize,
    setQueueProgress,
    setActiveMatch,
  } = useMatchmakingStore();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const [activeMatchId, setActiveMatchId] = useState<string | null>(null);
  const [scrimSearching, setScrimSearching] = useState(false);
  const [friends, setFriends] = useState<FriendSummary[]>([]);
  const [recentMatches, setRecentMatches] = useState<RecentMatch[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [friendsOpen, setFriendsOpen] = useState(false);
  const queueMissesRef = useRef(0);
  const historyWrapRef = useRef<HTMLDivElement>(null);
  const friendsWrapRef = useRef<HTMLDivElement>(null);

  const navItems = useMemo(
    () => (user?.role === "ADMIN" ? [...primaryNav, { label: "Admin", icon: <Shield size={21} />, to: "/admin" }] : primaryNav),
    [user?.role],
  );

  useEffect(() => {
    const socket = getSocket();
    const onMatchFound = (payload: PendingMatchPayload) => setMatchFound(payload);
    const onVetoStart = (payload?: { matchId?: string }) => {
      const targetMatchId = payload?.matchId ?? pendingMatch?.matchId;
      clearPendingMatch();
      if (targetMatchId) navigate({ to: "/match/$matchId", params: { matchId: targetMatchId } });
    };
    const onCancelled = () => resetMatchmaking();

    socket.on("matchmaking:found", onMatchFound);
    socket.on("veto:start", onVetoStart);
    socket.on("matchmaking:cancelled", onCancelled);
    return () => {
      socket.off("matchmaking:found", onMatchFound);
      socket.off("veto:start", onVetoStart);
      socket.off("matchmaking:cancelled", onCancelled);
    };
  }, [clearPendingMatch, navigate, pendingMatch?.matchId, resetMatchmaking, setMatchFound]);

  useEffect(() => {
    if (!user) return;
    const userId = user.id;
    let cancelled = false;

    async function syncQueueStatus() {
      try {
        const { data: queueStatus } = await api.get<QueueStatusResponse>("/matchmaking/queue/status");
        let snapshot: QueueSnapshotResponse | null = null;
        try {
          const response = await api.get<QueueSnapshotResponse>("/matchmaking/queue/snapshot");
          snapshot = response.data;
        } catch {
          snapshot = null;
        }

        if (cancelled) return;

        if (typeof queueStatus.queueSize === "number") setQueueSize(queueStatus.queueSize);
        if (queueStatus.inQueue) {
          queueMissesRef.current = 0;
          if (status !== "searching" || !searchStartedAt) startSearching(queueStatus.joinedAt);
        } else if (status === "searching") {
          queueMissesRef.current += 1;
          if (queueMissesRef.current >= 2) stopSearching();
        }

        if (snapshot) {
          setQueueSize(snapshot.count);
          const position = snapshot.players.findIndex((entry) => entry.userId === userId);
          setQueueProgress({ position: position >= 0 ? position + 1 : null });
        }
      } catch {
        if (cancelled) return;
      }
    }

    syncQueueStatus();
    const interval = window.setInterval(syncQueueStatus, 8000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [searchStartedAt, setQueueProgress, setQueueSize, startSearching, status, stopSearching, user]);

  useEffect(() => {
    const socket = getSocket();
    const onQueueUpdate = (payload: { position?: number; etaSeconds?: number; queueSize?: number }) => {
      if (typeof payload.queueSize === "number") setQueueSize(payload.queueSize);
      setQueueProgress({ position: payload.position, etaSeconds: payload.etaSeconds });
    };

    socket.on("matchmaking:queue_update", onQueueUpdate);
    socket.on("matchmaking:queue_public_update", onQueueUpdate);
    return () => {
      socket.off("matchmaking:queue_update", onQueueUpdate);
      socket.off("matchmaking:queue_public_update", onQueueUpdate);
    };
  }, [setQueueProgress, setQueueSize]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    async function syncScrimSearchStatus() {
      try {
        const { data } = await api.get<ScrimsNavResponse>("/scrims");
        if (cancelled) return;
        const myTeamId = data.myTeam?.id ?? null;
        setScrimSearching(Boolean(myTeamId && data.searches.some((search) => search.teamId === myTeamId && (search.status ?? "OPEN") === "OPEN")));
      } catch {
        if (!cancelled) setScrimSearching(false);
      }
    }

    const socket = getSocket();
    const onRefresh = () => { void syncScrimSearchStatus(); };
    void syncScrimSearchStatus();
    socket.on("scrims:search_updated", onRefresh);
    socket.on("scrims:challenge_updated", onRefresh);
    socket.on("teams:updated", onRefresh);
    const interval = window.setInterval(syncScrimSearchStatus, 10000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      socket.off("scrims:search_updated", onRefresh);
      socket.off("scrims:challenge_updated", onRefresh);
      socket.off("teams:updated", onRefresh);
    };
  }, [user]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    async function loadActiveMatch() {
      try {
        const { data } = await api.get<{ match: ActiveMatchResponse | null }>("/matchmaking/active");
        if (cancelled) return;
        if (!data.match) {
          setActiveMatchId(null);
          setActiveMatch(null);
          clearPendingMatch();
          return;
        }
        if (data.match.status === "ACCEPTING" && data.match.pending) setMatchFound(data.match.pending);
        if (data.match.status !== "ACCEPTING") {
          clearPendingMatch();
          setActiveMatchId(data.match.id);
          setActiveMatch(data.match.id);
          return;
        }
        setActiveMatch(null);
      } catch {
        if (!cancelled) {
          setActiveMatchId(null);
          setActiveMatch(null);
        }
      }
    }
    loadActiveMatch();
    const interval = window.setInterval(loadActiveMatch, 5000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [clearPendingMatch, setActiveMatch, setMatchFound, user]);

  useEffect(() => {
    if (!user?.username) return;
    const username = user.username;
    let cancelled = false;

    async function loadSideData() {
      try {
        const [friendsRes, matchesRes] = await Promise.all([
          api.get<FriendsResponse>("/friends/me"),
          api.get<RecentMatch[]>(`/users/${encodeURIComponent(username)}/matches`),
        ]);
        if (cancelled) return;
        setFriends((friendsRes.data.friends ?? []).slice(0, 8));
        setRecentMatches((matchesRes.data ?? []).slice(0, 8));
      } catch {
        if (cancelled) return;
      }
    }

    const socket = getSocket();
    const onRefresh = () => { void loadSideData(); };
    void loadSideData();
    socket.on("friends:updated", onRefresh);
    socket.on("user:elo_update", onRefresh);
    return () => {
      cancelled = true;
      socket.off("friends:updated", onRefresh);
      socket.off("user:elo_update", onRefresh);
    };
  }, [user?.username]);

  useEffect(() => {
    if (!historyOpen && !friendsOpen) return;
    function handleOutside(e: MouseEvent) {
      const target = e.target as Node;
      if (historyOpen && historyWrapRef.current && !historyWrapRef.current.contains(target)) setHistoryOpen(false);
      if (friendsOpen && friendsWrapRef.current && !friendsWrapRef.current.contains(target)) setFriendsOpen(false);
    }
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [friendsOpen, historyOpen]);

  async function handleLogout() {
    await api.post("/auth/logout").catch(() => {});
    logout();
    navigate({ to: "/" });
  }

  if (!user) return null;
  const rankMeta = getRankMeta(user.level ?? parseRankLevel(user.rank));
  const globalStatus = pendingMatch
    ? "Aceptando"
    : activeMatchId
      ? "En partida"
      : status === "searching"
        ? "Buscando"
        : "Listo";

  return (
    <div className="storm-axis-shell">
      <aside className="storm-sidebar" aria-label="Navegación principal">
        <Link to="/dashboard" className="storm-brand" aria-label="StormAxis">
          <img src="/brand/logo.webp" alt="StormAxis" className="storm-brand-logo" />
          <div>
            <div className="storm-brand-title">Storm<span>Axis</span></div>
            <span className="storm-brand-subtitle">Sudamérica · Beta</span>
          </div>
        </Link>

        <nav className="storm-nav">
          {navItems.map((item) => (
            <SidebarItem
              key={item.label}
              item={item}
              active={isNavActive(pathname, item)}
              isSearching={status === "searching"}
              isScrimSearching={scrimSearching}
            />
          ))}
        </nav>

        <div className="storm-sidebar-card">
          <div className="storm-sidebar-card-title">Tormenta activa</div>
          <div className="storm-sidebar-actions">
            <a className="storm-sidebar-action discord" href={DISCORD_INVITE_URL} target="_blank" rel="noreferrer">
              <svg className="storm-discord-icon" aria-hidden="true"><use href="/icons.svg#discord-icon" /></svg> Discord
            </a>
            <button type="button" onClick={handleLogout} className="storm-sidebar-action">
              <LogOut size={15} /> Salir
            </button>
          </div>
        </div>
      </aside>

      <main className="storm-main">
        {activeMatchId && pathname === "/dashboard" ? (
          <button className="storm-ghost-btn" style={{ position: "absolute", right: 10, top: 8, zIndex: 5, minWidth: 0 }} onClick={() => navigate({ to: "/match/$matchId", params: { matchId: activeMatchId } })}>
            Reabrir partida activa
          </button>
        ) : null}
        <Outlet />
      </main>

      <aside className="storm-global-right-panel" aria-label="Panel de cuenta y notificaciones">
        <section className="storm-side-account" aria-label="Perfil del jugador">
          <div className={`storm-avatar storm-avatar--lg${user.avatar ? "" : " empty"}`}>
            {user.avatar ? <img src={user.avatar} alt={user.username} /> : null}
          </div>
          <div className="storm-side-account-name">
            <PlayerLink username={user.username}>{user.username}</PlayerLink>
          </div>
          <div className="storm-status-line storm-side-account-status">
            <span className="storm-status-dot" />
            {globalStatus}
          </div>
          <div className="storm-side-rank">
            <div className="storm-rank-emblem">
              <img src={rankMeta.iconSrc} alt="" />
            </div>
            <div className="storm-side-rank-copy">
              <div className="storm-rank-title">{rankMeta.label}</div>
              <div className="storm-rank-sub">{user.mmr.toLocaleString("es-AR")} ELO</div>
            </div>
          </div>
        </section>

        <section className="storm-side-meta">
          <div className="storm-side-progress-track">
            <span style={{ width: `${Math.max(2, Math.min(100, user.levelProgressPct ?? 0))}%` }} />
          </div>
          <div className="storm-side-progress-foot">
            {user.nextLevelAt != null ? `+${Math.max(0, user.nextLevelAt - user.mmr)}` : "Nivel máximo actual"}
          </div>
        </section>

        <div className="storm-side-notif">
          <NotificationBell />
        </div>

        <div className="storm-side-notif storm-side-rail-action">
          <div className="storm-notif-wrap" ref={historyWrapRef}>
          <button
            className={`storm-notif-btn${historyOpen ? " open" : ""}`}
            type="button"
            onClick={() => setHistoryOpen((v) => !v)}
            aria-label="Historial reciente"
            aria-expanded={historyOpen}
            aria-haspopup="true"
          >
            <Swords size={23} />
          </button>
          {historyOpen ? (
            <div className="storm-notif-panel storm-left-flyout storm-side-history-panel" role="dialog" aria-label="Panel de historial reciente">
              <div className="storm-notif-head">
                <span className="storm-notif-title">Partidas recientes</span>
                <span className="storm-notif-new">{recentMatches.length}</span>
              </div>
              <div className="storm-side-vs-list">
                {recentMatches.length === 0 ? (
                  <span className="storm-side-vs-empty">Sin historial todavía.</span>
                ) : (
                  recentMatches.map((entry) => {
                    const win = entry.match.winner != null && entry.match.winner === entry.team;
                    return (
                      <div key={entry.id} className="storm-side-vs-row">
                        <span className={win ? "storm-side-vs-win" : "storm-side-vs-loss"}>{win ? "W" : "L"}</span>
                        <span>{entry.match.selectedMap ?? "Mapa pendiente"}</span>
                        <time>{new Date(entry.match.createdAt).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" })}</time>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          ) : null}
          </div>
        </div>

        <div className="storm-side-notif storm-side-rail-action">
          <div className="storm-notif-wrap" ref={friendsWrapRef}>
          <button
            className={`storm-notif-btn${friendsOpen ? " open" : ""}`}
            type="button"
            onClick={() => setFriendsOpen((v) => !v)}
            aria-label="Amigos"
            aria-expanded={friendsOpen}
            aria-haspopup="true"
          >
            <Users size={23} />
            {friends.length > 0 ? <span className="storm-notif-badge" aria-label={`${friends.length} amigos`}>{friends.length}</span> : null}
          </button>
          {friendsOpen ? (
            <div className="storm-notif-panel storm-left-flyout storm-side-friends-panel" role="dialog" aria-label="Panel de amigos">
              <div className="storm-notif-head">
                <span className="storm-notif-title">Mis amigos</span>
                <span className="storm-notif-new">{friends.length}</span>
              </div>
              <div className="storm-side-friends-list">
                {friends.length === 0 ? (
                  <span className="storm-side-vs-empty">Sin amigos aún.</span>
                ) : (
                  friends.map((friend) => (
                    <Link key={friend.id} to="/profile/$username" params={{ username: friend.username }} className="storm-side-friend-row">
                      <span className={`storm-avatar storm-avatar--sm${friend.avatar ? "" : " empty"}`}>
                        {friend.avatar ? <img src={friend.avatar} alt={friend.username} /> : null}
                      </span>
                      <span className="storm-side-friend-copy">
                        <span className="storm-side-friend-name">{friend.username}</span>
                        <span className={`storm-side-presence storm-side-presence--${(friend.presenceStatus ?? "OFFLINE").toLowerCase().replace("_", "-")}`}>
                          {friend.presenceStatus === "IN_MATCH" ? "En partida" : friend.presenceStatus === "ONLINE" ? "Online" : "Offline"}
                        </span>
                      </span>
                    </Link>
                  ))
                )}
              </div>
            </div>
          ) : null}
          </div>
        </div>
      </aside>

      {pendingMatch && <MatchFoundModal match={pendingMatch} />}
    </div>
  );
}

function SidebarItem({ item, active, isSearching, isScrimSearching }: { item: NavItem; active: boolean; isSearching: boolean; isScrimSearching: boolean }) {
  const showSearchingBadge = item.to === "/dashboard" && isSearching;
  const showScrimBadge = item.to === "/scrims" && isScrimSearching;
  const content = (
    <>
      {item.dividerBefore ? <div className="storm-sidebar-divider" /> : null}
      <div className={`storm-nav-item${active ? " active" : ""}`} style={item.disabled ? { opacity: 0.72, cursor: "not-allowed" } : undefined}>
        <span className="storm-nav-ico">{item.icon}</span>
        <span className="storm-nav-label">{item.label}</span>
        {showSearchingBadge ? (
          <span className="storm-nav-queue-badge" aria-label="Buscando partida">
            <span className="storm-nav-queue-dot" aria-hidden="true" /> En cola
          </span>
        ) : null}
        {showScrimBadge ? (
          <span className="storm-nav-queue-badge storm-nav-scrim-badge" aria-label="Buscando scrim">
            <span className="storm-nav-queue-dot storm-nav-scrim-dot" aria-hidden="true" /> Buscando
          </span>
        ) : null}
      </div>
    </>
  );
  if (item.disabled || !item.to) return <div>{content}</div>;
  return <Link to={item.to} style={{ textDecoration: "none" }}>{content}</Link>;
}

function isNavActive(pathname: string, item: NavItem) {
  if (!item.to) return false;
  if (item.to === "/profile") return pathname === "/profile" || pathname.startsWith("/profile/");
  return pathname === item.to;
}
