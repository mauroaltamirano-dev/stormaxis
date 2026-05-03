import { useEffect, useMemo, useRef, useState } from "react";
import { Outlet, Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { BarChart3, BookOpen, FlaskConical, LogOut, Play, Settings, Shield, Swords, Trophy, User, Users } from "lucide-react";
import { useAuthStore } from "../stores/auth.store";
import { useMatchmakingStore } from "../stores/matchmaking.store";
import { api } from "../lib/api";
import { getSocket } from "../lib/socket";
import { type MatchLifecycleStatus } from "../lib/competitiveStatus";
import { MatchFoundModal } from "../components/matchmaking/MatchFoundModal";
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

type NavItem = { label: string; icon: React.ReactNode; to?: string; disabled?: boolean; dividerBefore?: boolean };

const DISCORD_INVITE_URL = import.meta.env.VITE_DISCORD_INVITE || "https://discord.gg/etkGDYkMgM";

const primaryNav: NavItem[] = [
  { label: "Jugar", icon: <Play size={20} fill="currentColor" />, to: "/dashboard" },
  { label: "Mi escuadra", icon: <Users size={21} />, to: "/teams" },
  { label: "SCRIM", icon: <Swords size={21} />, to: "/scrims" },
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
  const queueMissesRef = useRef(0);

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

  async function handleLogout() {
    await api.post("/auth/logout").catch(() => {});
    logout();
    navigate({ to: "/" });
  }

  if (!user) return null;

  return (
    <div className="storm-axis-shell">
      <aside className="storm-sidebar" aria-label="Navegación principal">
        <Link to="/dashboard" className="storm-brand" aria-label="StormAxis">
          <div className="storm-brand-mark" />
          <div>
            <div className="storm-brand-title">Storm<span>Axis</span></div>
            <span className="storm-brand-subtitle">Nexus Matchmaking</span>
          </div>
        </Link>

        <nav className="storm-nav">
          {navItems.map((item) => (
            <SidebarItem key={item.label} item={item} active={isNavActive(pathname, item)} isSearching={status === "searching"} />
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
          <button className="storm-ghost-btn" style={{ position: "absolute", right: 26, top: 86, zIndex: 5, minWidth: 0 }} onClick={() => navigate({ to: "/match/$matchId", params: { matchId: activeMatchId } })}>
            Reabrir partida activa
          </button>
        ) : null}
        <Outlet />
      </main>

      {pendingMatch && <MatchFoundModal match={pendingMatch} />}
    </div>
  );
}

function SidebarItem({ item, active, isSearching }: { item: NavItem; active: boolean; isSearching: boolean }) {
  const showSearchingBadge = item.to === "/dashboard" && isSearching;
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
