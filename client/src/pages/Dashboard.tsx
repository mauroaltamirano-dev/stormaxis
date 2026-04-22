import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useAuthStore } from "../stores/auth.store";
import { useMatchmakingStore } from "../stores/matchmaking.store";
import { api } from "../lib/api";
import { getSocket } from "../lib/socket";
import { reportClientError } from "../lib/monitoring";
import { PlayerSlotShell } from "../components/PlayerSlotShell";
import { MatchFoundModal } from "../components/matchmaking/MatchFoundModal";
import { ChevronDown, Plus, Search } from "lucide-react";
import { getRoleIconSources, getRoleMeta } from "../lib/roles";
import { getRankMeta, parseRankLevel } from "../lib/ranks";
import { getQueueLifecycleMeta } from "../lib/competitiveStatus";

function formatCompactRating(value: number) {
  return value.toLocaleString("es-AR");
}

function CardCorners({ color }: { color: string }) {
  const common: React.CSSProperties = {
    position: "absolute",
    width: "18px",
    height: "18px",
    borderColor: color,
    opacity: 0.7,
    pointerEvents: "none",
  };

  return (
    <>
      <div
        style={{
          ...common,
          top: "10px",
          left: "10px",
          borderTop: "2px solid",
          borderLeft: "2px solid",
        }}
      />
      <div
        style={{
          ...common,
          top: "10px",
          right: "10px",
          borderTop: "2px solid",
          borderRight: "2px solid",
        }}
      />
      <div
        style={{
          ...common,
          bottom: "10px",
          left: "10px",
          borderBottom: "2px solid",
          borderLeft: "2px solid",
        }}
      />
      <div
        style={{
          ...common,
          bottom: "10px",
          right: "10px",
          borderBottom: "2px solid",
          borderRight: "2px solid",
        }}
      />
    </>
  );
}

const MODES = [
  { key: "COMPETITIVE", label: "Competitivo", desc: "Draft · MMR activo" },
  // { key: 'UNRANKED', label: 'Unranked', desc: 'Draft · Sin MMR' },
  // { key: 'TEAM', label: 'Equipo', desc: '5-Stack · Clan' },
];

// 5-slot party layout: indices 0-4, center is always index 2 (the user)
const SLOT_ORDER = [0, 1, 2, 3, 4];
const DISMISSED_ACTIVE_MATCH_KEY = "nexusgg.dismissedActiveMatchId";

type AdminMatchRow = {
  id: string;
  status: string;
  selectedMap?: string | null;
  createdAt: string;
  players: Array<{
    userId: string | null;
    isBot?: boolean;
    botName?: string | null;
    accepted?: boolean | null;
    user?: { username?: string };
  }>;
};

type LiveMatchRow = {
  id: string;
  status: "VETOING" | "PLAYING" | "VOTING";
  mode: string;
  region: string;
  selectedMap: string | null;
  createdAt: string;
  startedAt?: string | null;
  viewerTeam: 1 | 2 | null;
  readyCount: number;
  totalPlayers: number;
  voteCounts: {
    team1Votes: number;
    team2Votes: number;
    total: number;
  };
  teams: Record<
    1 | 2,
    Array<{
      userId: string | null;
      username: string;
      avatar: string | null;
      mmr: number;
      isCaptain: boolean;
      isBot: boolean;
    }>
  >;
};

type OpsEventTone = "neutral" | "good" | "warn";

type OpsEvent = {
  id: string;
  at: number;
  title: string;
  detail: string;
  tone: OpsEventTone;
};

function formatCountdown(seconds: number) {
  return `0:${String(Math.max(0, seconds)).padStart(2, "0")}`;
}

function formatEventTime(timestamp: number) {
  return new Intl.DateTimeFormat("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(timestamp);
}

export function Dashboard() {
  const navigate = useNavigate();
  const { user, updateUser } = useAuthStore();
  const {
    status,
    searchStartedAt,
    pendingMatch,
    queueSize,
    queuePosition,
    queueEtaSeconds,
    startSearching,
    stopSearching,
    setMatchFound,
    clearPendingMatch,
    resetMatchmaking,
    setQueueSize,
    setQueueProgress,
  } = useMatchmakingStore() as any;

  const [selectedMode, setSelectedMode] = useState("COMPETITIVE");
  const [elapsed, setElapsed] = useState(0);
  const [dismissedActiveMatchId, setDismissedActiveMatchId] = useState<
    string | null
  >(() => window.sessionStorage.getItem(DISMISSED_ACTIVE_MATCH_KEY));
  const [hiddenActiveMatchId, setHiddenActiveMatchId] = useState<string | null>(
    null,
  );
  const [hasActiveMatch, setHasActiveMatch] = useState(false);
  const [queuePreview, setQueuePreview] = useState<
    Array<{
      userId: string;
      username: string;
      avatar: string | null;
      mmr: number;
      joinedAt: number | null;
      roles?: string[];
      isBot?: boolean;
    }>
  >([]);
  const [adminMatches, setAdminMatches] = useState<AdminMatchRow[]>([]);
  const [liveMatches, setLiveMatches] = useState<LiveMatchRow[]>([]);
  const [liveMatchesOpen, setLiveMatchesOpen] = useState(true);
  const [adminLoading, setAdminLoading] = useState(false);
  const [adminActionMatchId, setAdminActionMatchId] = useState<string | null>(
    null,
  );
  const [adminFillingBots, setAdminFillingBots] = useState(false);
  const [adminError, setAdminError] = useState<string | null>(null);
  const [avatarLoadError, setAvatarLoadError] = useState(false);
  const [matchmakingLayout, setMatchmakingLayout] = useState<"split" | "stack">(
    "split",
  );
  const [hoveredEmptySlot, setHoveredEmptySlot] = useState<number | null>(null);
  const [acceptCountdown, setAcceptCountdown] = useState<number | null>(null);
  const [opsEvents, setOpsEvents] = useState<OpsEvent[]>([]);
  const [isOpsLogOpen, setIsOpsLogOpen] = useState(false);
  const [currentStreak, setCurrentStreak] = useState(0);
  const [streakType, setStreakType] = useState<"win" | "loss" | null>(null);
  const [viewportWidth, setViewportWidth] = useState<number>(() =>
    typeof window === "undefined" ? 1280 : window.innerWidth,
  );
  const queueSizeRef = useRef<number | null>(null);

  const pushOpsEvent = useCallback(
    (title: string, detail: string, tone: OpsEventTone = "neutral") => {
      const event: OpsEvent = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        at: Date.now(),
        title,
        detail,
        tone,
      };
      setOpsEvents((prev) => [event, ...prev].slice(0, 10));
    },
    [],
  );

  useEffect(() => {
    if (status !== "searching" || !searchStartedAt) return;
    const iv = setInterval(
      () => setElapsed(Math.floor((Date.now() - searchStartedAt) / 1000)),
      1000,
    );
    return () => clearInterval(iv);
  }, [status, searchStartedAt]);

  useEffect(() => {
    if (!pendingMatch?.expiresAt) {
      setAcceptCountdown(null);
      return;
    }

    const syncCountdown = () =>
      setAcceptCountdown(
        Math.max(0, Math.round((pendingMatch.expiresAt - Date.now()) / 1000)),
      );

    syncCountdown();
    const iv = window.setInterval(syncCountdown, 1000);
    return () => window.clearInterval(iv);
  }, [pendingMatch?.expiresAt]);

  useEffect(() => {
    const onResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    const socket = getSocket();
    socket.on("matchmaking:found", (data: any) => {
      setHasActiveMatch(true);
      setMatchFound(data);
      pushOpsEvent(
        "Match encontrado",
        "Se abrió la ventana de confirmación para los 10 jugadores.",
        "good",
      );
    });
    socket.on("veto:start", () => {
      pushOpsEvent(
        "Veto iniciado",
        "La lobby confirmó jugadores y pasó a selección de mapas.",
        "good",
      );
      if (pendingMatch?.matchId) {
        clearPendingMatch();
        navigate({
          to: "/match/$matchId",
          params: { matchId: pendingMatch.matchId },
        });
      }
    });
    socket.on("matchmaking:cancelled", () => {
      pushOpsEvent(
        "Match cancelado",
        "Una confirmación falló o el ciclo fue cancelado.",
        "warn",
      );
      window.sessionStorage.removeItem(DISMISSED_ACTIVE_MATCH_KEY);
      setDismissedActiveMatchId(null);
      setHiddenActiveMatchId(null);
      setHasActiveMatch(false);
      resetMatchmaking();
    });
    socket.on(
      "matchmaking:queue_update",
      (payload: {
        position?: number;
        etaSeconds?: number;
        queueSize?: number;
      }) => {
        if (typeof payload?.queueSize === "number") {
          setQueueSize(payload.queueSize);
        }
        if (
          typeof payload?.position === "number" &&
          payload.position > 0 &&
          payload.position <= 3
        ) {
          pushOpsEvent(
            "Prioridad de cola",
            `Subiste a posición #${payload.position}.`,
            "good",
          );
        }
        setQueueProgress({
          position: payload?.position,
          etaSeconds: payload?.etaSeconds,
        });
      },
    );
    socket.on(
      "matchmaking:queue_public_update",
      (payload: { queueSize?: number }) => {
        if (typeof payload?.queueSize === "number") {
          setQueueSize(payload.queueSize);
        }
      },
    );
    socket.on(
      "user:elo_update",
      (data: { newMMR: number; delta: number; newRank: string }) => {
        if (typeof updateUser === "function")
          updateUser({ mmr: data.newMMR, rank: data.newRank });
      },
    );
    return () => {
      socket.off("matchmaking:found");
      socket.off("veto:start");
      socket.off("matchmaking:cancelled");
      socket.off("matchmaking:queue_update");
      socket.off("matchmaking:queue_public_update");
      socket.off("user:elo_update");
    };
  }, [
    clearPendingMatch,
    navigate,
    pendingMatch?.matchId,
    resetMatchmaking,
    setMatchFound,
    setQueueProgress,
    setQueueSize,
    updateUser,
    pushOpsEvent,
  ]);

  useEffect(() => {
    api
      .get<{
        inQueue: boolean;
        queueSize?: number;
        mode?: string;
        joinedAt?: number;
      }>("/matchmaking/queue/status")
      .then(({ data }) => {
        if (!data.inQueue) {
          if (!pendingMatch && !hasActiveMatch) {
            resetMatchmaking();
          }
          return;
        }
        if (data.mode) setSelectedMode(data.mode);
        if (data.queueSize != null) setQueueSize(data.queueSize);
        setQueueProgress({ position: null, etaSeconds: null });
        startSearching(data.joinedAt);
      })
      .catch(() => {});
  }, [
    hasActiveMatch,
    pendingMatch,
    resetMatchmaking,
    setQueueProgress,
    setQueueSize,
    startSearching,
  ]);

  useEffect(() => {
    let cancelled = false;

    async function loadQueueSnapshot() {
      try {
        const { data } = await api.get<{
          count: number;
          players: Array<{
            userId: string;
            username: string;
            avatar: string | null;
            mmr: number;
            joinedAt: number | null;
            roles?: string[];
            isBot?: boolean;
          }>;
        }>("/matchmaking/queue/snapshot");

        if (cancelled) return;
        setQueuePreview(data.players);
        setQueueSize(data.count);
        if (user?.id) {
          const position = data.players.findIndex(
            (entry) => entry.userId === user.id,
          );
          if (position >= 0) {
            setQueueProgress({ position: position + 1 });
          }
        }
      } catch {
        if (!cancelled) setQueuePreview([]);
      }
    }

    loadQueueSnapshot();
    const interval = setInterval(loadQueueSnapshot, 5000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [setQueueProgress, setQueueSize, user?.id]);

  useEffect(() => {
    if (!user) return;

    let cancelled = false;

    async function loadActiveMatch() {
      try {
        const { data } = await api.get<{
          match: any | null;
        }>("/matchmaking/active");

        if (cancelled) return;
        if (!data.match) {
          setHasActiveMatch(false);
          setHiddenActiveMatchId(null);
          return;
        }
        setHasActiveMatch(true);

        if (data.match.status === "ACCEPTING") {
          if (data.match.pending) {
            setMatchFound(data.match.pending);
          } else {
            clearPendingMatch();
          }
        } else {
          if (dismissedActiveMatchId === data.match.id) {
            setHiddenActiveMatchId(data.match.id);
            return;
          }
          window.sessionStorage.removeItem(DISMISSED_ACTIVE_MATCH_KEY);
          setDismissedActiveMatchId(null);
          setHiddenActiveMatchId(null);
          clearPendingMatch();
          navigate({
            to: "/match/$matchId",
            params: { matchId: data.match.id },
          });
        }
      } catch {
        // noop
      }
    }

    loadActiveMatch();
    const interval = setInterval(loadActiveMatch, 5000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [
    clearPendingMatch,
    dismissedActiveMatchId,
    navigate,
    pendingMatch?.matchId,
    setMatchFound,
    user,
  ]);

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
    if (!user || user.role !== "ADMIN") {
      setAdminMatches([]);
      return;
    }

    let cancelled = false;

    async function loadAdminMatches() {
      try {
        setAdminLoading(true);
        const { data } = await api.get<AdminMatchRow[]>("/admin/matches");
        if (cancelled) return;
        setAdminMatches(
          data.filter((match) =>
            ["ACCEPTING", "VETOING", "PLAYING", "VOTING", "PENDING"].includes(
              match.status,
            ),
          ),
        );
        setAdminError(null);
      } catch {
        if (!cancelled) setAdminError("No pude cargar los matches admin.");
      } finally {
        if (!cancelled) setAdminLoading(false);
      }
    }

    loadAdminMatches();
    const interval = setInterval(loadAdminMatches, 4000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [user]);

  useEffect(() => {
    setAvatarLoadError(false);
  }, [user?.avatar]);

  useEffect(() => {
    if (!user?.username) return;
    api
      .get<
        Array<{
          team: number;
          match: { winner: number | null; createdAt: string };
        }>
      >(`/users/${user.username}/matches`)
      .then(({ data }) => {
        const completed = [...data]
          .filter((e) => e.match.winner !== null)
          .sort(
            (a, b) =>
              new Date(b.match.createdAt).getTime() -
              new Date(a.match.createdAt).getTime(),
          );
        if (!completed.length) {
          setCurrentStreak(0);
          setStreakType(null);
          return;
        }
        const firstType =
          completed[0].match.winner === completed[0].team ? "win" : "loss";
        let count = 0;
        for (const entry of completed) {
          const type = entry.match.winner === entry.team ? "win" : "loss";
          if (type === firstType) count++;
          else break;
        }
        setCurrentStreak(count);
        setStreakType(firstType);
      })
      .catch(() => {});
  }, [user?.username]);

  async function handleFindMatch() {
    if (hasActiveMatch) return;

    if (status === "searching") {
      await api.post("/matchmaking/queue/leave");
      stopSearching();
      pushOpsEvent(
        "Salida de cola",
        "Cancelaste búsqueda manualmente desde dashboard.",
        "warn",
      );
      return;
    }
    try {
      await api.post("/matchmaking/queue/join", {
        mode: selectedMode,
      });
      startSearching();
      pushOpsEvent(
        "Entrada a cola",
        "Iniciaste búsqueda competitiva con tus roles de perfil.",
        "good",
      );
    } catch (err: any) {
      console.error("Queue error:", err.response?.data);
      reportClientError(err, "dashboard.queue.join_leave");
      pushOpsEvent(
        "Error de cola",
        err?.response?.data?.error?.message ?? "No se pudo procesar la acción.",
        "warn",
      );
    }
  }

  async function handleAdminCancelMatch(matchId: string) {
    try {
      setAdminActionMatchId(matchId);
      await api.patch(`/admin/matches/${matchId}/cancel`);
      setAdminMatches((prev) => prev.filter((match) => match.id !== matchId));
      pushOpsEvent(
        "Admin canceló match",
        `Match ${matchId.slice(0, 8)} marcado como CANCELLED.`,
        "warn",
      );
      if (hiddenActiveMatchId === matchId) {
        window.sessionStorage.removeItem(DISMISSED_ACTIVE_MATCH_KEY);
        setDismissedActiveMatchId(null);
        setHiddenActiveMatchId(null);
      }
      if (pendingMatch?.matchId === matchId) {
        clearPendingMatch();
      }
    } catch (err: any) {
      setAdminError(
        err.response?.data?.error?.message ?? "No pude cancelar el match.",
      );
      pushOpsEvent(
        "Error admin",
        err?.response?.data?.error?.message ?? "No se pudo cancelar el match.",
        "warn",
      );
    } finally {
      setAdminActionMatchId(null);
    }
  }

  async function handleAdminDeleteMatch(matchId: string) {
    try {
      setAdminActionMatchId(matchId);
      await api.delete(`/admin/matches/${matchId}`);
      setAdminMatches((prev) => prev.filter((match) => match.id !== matchId));
      pushOpsEvent(
        "Admin borró match",
        `Match ${matchId.slice(0, 8)} eliminado del sistema.`,
        "warn",
      );
      if (hiddenActiveMatchId === matchId) {
        window.sessionStorage.removeItem(DISMISSED_ACTIVE_MATCH_KEY);
        setDismissedActiveMatchId(null);
        setHiddenActiveMatchId(null);
      }
      if (pendingMatch?.matchId === matchId) {
        clearPendingMatch();
      }
    } catch (err: any) {
      setAdminError(
        err.response?.data?.error?.message ?? "No pude borrar el match.",
      );
      pushOpsEvent(
        "Error admin",
        err?.response?.data?.error?.message ?? "No se pudo borrar el match.",
        "warn",
      );
    } finally {
      setAdminActionMatchId(null);
    }
  }

  async function handleAdminFillBots() {
    try {
      setAdminFillingBots(true);
      setAdminError(null);
      await api.post("/admin/queue/fill-bots", { targetSize: 10 });
      pushOpsEvent(
        "Admin completó cola",
        "Se agregaron bots para llegar a 10 jugadores.",
        "neutral",
      );
    } catch (err: any) {
      setAdminError(
        err.response?.data?.error?.message ??
          "No pude completar la cola con bots.",
      );
      pushOpsEvent(
        "Error admin",
        err?.response?.data?.error?.message ??
          "No se pudo completar la cola con bots.",
        "warn",
      );
    } finally {
      setAdminFillingBots(false);
    }
  }

  async function handleAdminClearQueue() {
    try {
      setAdminFillingBots(true);
      setAdminError(null);
      await api.post("/admin/queue/clear");
      setQueuePreview([]);
      resetMatchmaking();
      pushOpsEvent(
        "Admin limpió cola",
        "Se purgó la cola de matchmaking para reiniciar testing.",
        "warn",
      );
    } catch (err: any) {
      setAdminError(
        err.response?.data?.error?.message ?? "No pude limpiar la cola.",
      );
      pushOpsEvent(
        "Error admin",
        err?.response?.data?.error?.message ?? "No se pudo limpiar la cola.",
        "warn",
      );
    } finally {
      setAdminFillingBots(false);
    }
  }

  const isSearching = status === "searching";
  const isAccepting = Boolean(pendingMatch);
  const findMatchDisabled = hasActiveMatch;
  const queuePreviewForDisplay = queuePreview;

  function formatElapsed(s: number) {
    const m = Math.floor(s / 60)
      .toString()
      .padStart(2, "0");
    const sec = (s % 60).toString().padStart(2, "0");
    return `${m}:${sec}`;
  }

  if (!user) return null;

  const level = user.level ?? parseRankLevel(user.rank);
  const rankMeta = getRankMeta(level);
  const rankColor = rankMeta.color;

  const profileRoles = [user.mainRole, user.secondaryRole].filter(
    Boolean,
  ) as string[];
  const acceptedCount = pendingMatch?.acceptedBy?.length ?? 0;
  const currentUserAccepted = user
    ? (pendingMatch?.acceptedBy ?? []).includes(user.id)
    : false;
  const totalPendingPlayers =
    pendingMatch?.totalPlayers ??
    (pendingMatch?.teams.team1.length ?? 0) +
      (pendingMatch?.teams.team2.length ?? 0);
  const queueStateMeta = getQueueLifecycleMeta({
    hasActiveMatch,
    isAccepting,
    isSearching,
    queueEtaSeconds,
    queuePosition,
    acceptedCount,
    totalPlayers: totalPendingPlayers,
  });
  const isMd = viewportWidth < 1024;
  const isSm = viewportWidth < 768;
  const isXs = viewportWidth < 560;
  const queueOccupancy = isAccepting
    ? totalPendingPlayers
    : (queueSize ?? queuePreviewForDisplay.length);
  const hasQueuePlayers = queueOccupancy > 0;
  const liveQueueState:
    | "idle"
    | "warming"
    | "active"
    | "accepting"
    | "blocked" = isAccepting
    ? "accepting"
    : hasActiveMatch
      ? "blocked"
      : hasQueuePlayers
        ? queuePreviewForDisplay.length > 0
          ? "active"
          : "warming"
        : "idle";
  const liveQueueTitle =
    liveQueueState === "accepting"
      ? "Accept en progreso"
      : liveQueueState === "blocked"
        ? "Partida activa"
        : "Jugadores buscando partida";
  const liveQueueSignal =
    liveQueueState === "accepting"
      ? `Aceptaron ${acceptedCount}/${totalPendingPlayers} · Ventana ${
          acceptCountdown != null ? formatCountdown(acceptCountdown) : "—"
        }`
      : liveQueueState === "blocked"
        ? "Tenés una partida abierta. No podés re-entrar a cola."
        : liveQueueState === "active"
          ? `${queueSize ?? queuePreviewForDisplay.length}/10 buscando · Espera ${
              queueEtaSeconds != null ? `~${queueEtaSeconds}s` : "calculando"
            }`
          : liveQueueState === "warming"
            ? "Sincronizando snapshot en vivo de la cola."
            : "No hay jugadores en cola ahora mismo.";

  const totalPlayed = user.wins + user.losses;
  const userWinrate =
    totalPlayed > 0 ? `${Math.round((user.wins / totalPlayed) * 100)}%` : "—";
  const waitValue = isAccepting
    ? acceptCountdown != null
      ? formatCountdown(acceptCountdown)
      : "—"
    : isSearching
      ? formatElapsed(elapsed)
      : "—";

  useEffect(() => {
    if (!isSearching || typeof queueSize !== "number") {
      queueSizeRef.current = null;
      return;
    }
    if (queueSizeRef.current == null) {
      queueSizeRef.current = queueSize;
      return;
    }
    if (queueSizeRef.current !== queueSize) {
      const diff = queueSize - queueSizeRef.current;
      queueSizeRef.current = queueSize;
      pushOpsEvent(
        "Movimiento de cola",
        diff > 0
          ? `Entraron ${diff} jugador${diff > 1 ? "es" : ""}. Total: ${queueSize}/10.`
          : `Salieron ${Math.abs(diff)} jugador${Math.abs(diff) > 1 ? "es" : ""}. Total: ${queueSize}/10.`,
        diff > 0 ? "neutral" : "warn",
      );
    }
  }, [isSearching, pushOpsEvent, queueSize]);

  return (
    <>
      {pendingMatch && <MatchFoundModal match={pendingMatch} />}

      <section
        style={{
          display: "grid",
          gap: "1.25rem",
          maxWidth: "1180px",
          margin: "0 auto",
        }}
      >
        <header
          style={{
            position: "relative",
            overflow: "hidden",
            border: "1px solid rgba(0,200,255,0.14)",
            background:
              "linear-gradient(135deg, rgba(0,200,255,0.10), rgba(124,77,255,0.06) 42%, #02060e), url('/images/617568.webp') center/cover",
            minHeight: "230px",
            padding: "1.4rem",
            display: "grid",
            alignItems: "end",
          }}
        >
          <div
            style={{
              position: "absolute",
              inset: 0,
              background:
                "linear-gradient(90deg, rgba(2,6,14,0.96), rgba(2,6,14,0.76) 45%, rgba(2,6,14,0.42))",
            }}
          />
          <div
            style={{
              position: "absolute",
              inset: 0,
              backgroundImage:
                "linear-gradient(90deg, rgba(0,200,255,0.07) 1px, transparent 1px), linear-gradient(rgba(0,200,255,0.05) 1px, transparent 1px)",
              backgroundSize: "34px 34px",
              opacity: 0.45,
            }}
          />

          <div style={{ position: "relative", display: "grid", gap: "1.1rem" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "1rem",
                flexWrap: "wrap",
              }}
            >
              <div>
                <div
                  style={{
                    color: "#7dd3fc",
                    fontFamily: "var(--font-display)",
                    fontSize: "0.72rem",
                    fontWeight: 900,
                    letterSpacing: "0.22em",
                    textTransform: "uppercase",
                    marginBottom: "0.45rem",
                  }}
                >
                  South America · Matchmaking competitivo
                </div>
                <h1
                  style={{
                    margin: 0,
                    color: "#fff",
                    fontFamily: "var(--font-display)",
                    fontSize: "clamp(2rem, 5vw, 4.1rem)",
                    lineHeight: 0.9,
                    fontWeight: 900,
                    letterSpacing: "0.04em",
                    textTransform: "uppercase",
                  }}
                >
                  Buscar partida
                </h1>
              </div>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: isXs
                  ? "repeat(2, minmax(120px, 1fr))"
                  : isMd
                    ? "repeat(2, minmax(120px, 1fr))"
                    : "repeat(4, minmax(120px, 1fr))",
                gap: "0.7rem",
              }}
            >
              <StatPanel
                label="Winrate"
                value={userWinrate}
                sub={`${user.wins}W / ${user.losses}L`}
                tone="#4ade80"
                iconSrc="/brand/winrate.thumb.webp"
              />
              <StatPanel
                label="MMR actual"
                value={user.mmr.toLocaleString("es-AR")}
                sub={rankMeta.label}
                tone={rankColor}
                iconSrc={rankMeta.iconSrc}
              />
              <StatPanel
                label="Partidas"
                value={(user.wins + user.losses).toString()}
                sub="Temporada actual"
                tone="#5217dd"
                iconSrc="/brand/matches.thumb.webp"
              />
              <StatPanel
                label="Racha"
                value={currentStreak > 0 ? `${currentStreak}` : "—"}
                sub={
                  streakType === "win"
                    ? `${currentStreak} victoria${currentStreak !== 1 ? "s" : ""} seguida${currentStreak !== 1 ? "s" : ""}`
                    : streakType === "loss"
                      ? `${currentStreak} derrota${currentStreak !== 1 ? "s" : ""} seguida${currentStreak !== 1 ? "s" : ""}`
                      : "Sin partidas"
                }
                tone={
                  streakType === "win"
                    ? "#F98005"
                    : streakType === "loss"
                      ? "#fb7185"
                      : "#94a3b8"
                }
                iconSrc={
                  streakType === "win"
                    ? "/brand/racha.thumb.webp"
                    : streakType === "loss"
                      ? "/brand/racha.thumb.webp"
                      : "/brand/logo.thumb.webp"
                }
              />
            </div>
          </div>
        </header>

        <section
          style={{
            display: "grid",
            gridTemplateColumns:
              matchmakingLayout === "stack" || isMd
                ? "1fr"
                : "minmax(0, 1.65fr) minmax(260px, 0.55fr)",
            gap: "1rem",
            alignItems: "stretch",
          }}
        >
          <div
            style={{
              border: "1px solid rgba(232,244,255,0.07)",
              background:
                "linear-gradient(180deg, rgba(17,25,39,0.82), rgba(8,12,20,0.72))",
              padding: "1rem",
              display: "grid",
              gap: "1rem",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: "1rem",
                flexWrap: "wrap",
              }}
            >
              <PanelTitle
                eyebrow="Centro de preparación"
                title="Escuadra previa"
              />
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.75rem",
                  flexWrap: "wrap",
                }}
              >
                <div
                  style={{
                    color: "rgba(232,244,255,0.40)",
                    fontSize: "0.8rem",
                    fontWeight: 700,
                  }}
                >
                  Identidad activa antes de entrar
                </div>
                <div
                  style={{
                    display: "flex",
                    border: "1px solid rgba(232,244,255,0.08)",
                    background: "rgba(2,6,14,0.45)",
                  }}
                >
                  <LayoutToggleButton
                    active={matchmakingLayout === "split"}
                    label="Compacto"
                    onClick={() => setMatchmakingLayout("split")}
                  />
                  <LayoutToggleButton
                    active={matchmakingLayout === "stack"}
                    label="Extendido"
                    onClick={() => setMatchmakingLayout("stack")}
                  />
                </div>
              </div>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: isXs
                  ? "repeat(2, minmax(90px, 1fr))"
                  : isSm
                    ? "repeat(3, minmax(90px, 1fr))"
                    : "repeat(5, minmax(90px, 1fr))",
                gap: matchmakingLayout === "stack" ? "0.9rem" : "0.7rem",
              }}
            >
              {SLOT_ORDER.map((idx) => {
                const isYou = idx === 2;
                return isYou ? (
                  <PlayerSlotShell
                    key="you"
                    color={rankColor}
                    minHeight={320}
                    isYou
                  >
                    {/* "Tú" label */}
                    <div
                      style={{
                        border: `1px solid ${rankColor}55`,
                        background: `${rankColor}14`,
                        color: rankColor,
                        padding: "2px 10px",
                        fontSize: "9px",
                        fontWeight: 900,
                        letterSpacing: "0.22em",
                        textTransform: "uppercase",
                        fontFamily: "var(--font-display)",
                      }}
                    >
                      Tú
                    </div>

                    {/* Hex avatar — wider proportions (regular hex ratio ~1.155) */}
                    <div
                      style={{
                        width: "90px",
                        height: "78px",
                        clipPath:
                          "polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%)",
                        background: `linear-gradient(135deg, ${rankColor}, ${rankColor}44)`,
                        display: "grid",
                        placeItems: "center",
                      }}
                    >
                      <div
                        style={{
                          width: "84px",
                          height: "72px",
                          clipPath:
                            "polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%)",
                          overflow: "hidden",
                          display: "grid",
                          placeItems: "center",
                          background: "rgba(4,10,20,0.95)",
                          color: rankColor,
                          fontFamily: "var(--font-display)",
                          fontWeight: 900,
                          fontSize: "1.15rem",
                        }}
                      >
                        {user.avatar && !avatarLoadError ? (
                          <img
                            src={user.avatar}
                            alt={user.username}
                            loading="lazy"
                            decoding="async"
                            onError={() => setAvatarLoadError(true)}
                            style={{
                              width: "100%",
                              height: "100%",
                              objectFit: "cover",
                            }}
                          />
                        ) : (
                          user.username.slice(0, 2).toUpperCase()
                        )}
                      </div>
                    </div>

                    {/* Rank image + label + MMR (outside avatar) */}
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        gap: "0.25rem",
                      }}
                    >
                      <img
                        src={rankMeta.iconSrc}
                        alt={rankMeta.label}
                        loading="lazy"
                        decoding="async"
                        style={{
                          width: "44px",
                          height: "44px",
                          objectFit: "contain",
                          filter: `drop-shadow(0 0 10px ${rankColor})`,
                        }}
                      />
                      <div
                        style={{
                          color: rankColor,
                          fontFamily: "var(--font-display)",
                          fontWeight: 900,
                          fontSize: "0.78rem",
                          letterSpacing: "0.16em",
                          textTransform: "uppercase",
                          textShadow: `0 0 12px ${rankColor}55`,
                        }}
                      >
                        {rankMeta.label}
                      </div>
                      <div
                        style={{
                          color: "rgba(255,255,255,0.55)",
                          fontSize: "0.72rem",
                          fontWeight: 700,
                          letterSpacing: "0.04em",
                        }}
                      >
                        {user.mmr.toLocaleString("es-AR")} MMR
                      </div>
                    </div>

                    {/* Username */}
                    <div
                      style={{
                        color: "#fff",
                        fontFamily: "var(--font-display)",
                        fontSize: "1rem",
                        fontWeight: 900,
                        letterSpacing: "0.06em",
                        lineHeight: 1,
                      }}
                    >
                      {user.username}
                    </div>

                    {/* Roles */}
                    <div style={{ display: "flex", gap: "0.45rem" }}>
                      {profileRoles.length > 0 ? (
                        profileRoles.map((role) => (
                          <RolePill key={role} role={role} iconOnly />
                        ))
                      ) : (
                        <RolePill role="Sin rol" muted />
                      )}
                    </div>
                  </PlayerSlotShell>
                ) : (
                  <div
                    key={idx}
                    onMouseEnter={() => setHoveredEmptySlot(idx)}
                    onMouseLeave={() =>
                      setHoveredEmptySlot((current) =>
                        current === idx ? null : current,
                      )
                    }
                    style={{
                      ...slotBaseStyle,
                      minHeight:
                        matchmakingLayout === "stack"
                          ? "290px"
                          : slotBaseStyle.minHeight,
                      border:
                        hoveredEmptySlot === idx
                          ? "1px solid rgba(0,200,255,0.28)"
                          : "1px solid rgba(148,163,184,0.10)",
                      background:
                        hoveredEmptySlot === idx
                          ? "linear-gradient(180deg, rgba(0,200,255,0.06), rgba(3,6,14,0.94))"
                          : "linear-gradient(180deg, rgba(8,12,22,0.9), rgba(3,6,14,0.92))",
                      clipPath:
                        "polygon(0 0, calc(100% - 14px) 0, 100% 14px, 100% 100%, 14px 100%, 0 calc(100% - 14px))",
                      transform:
                        hoveredEmptySlot === idx
                          ? "translateY(-2px)"
                          : "translateY(0)",
                      boxShadow:
                        hoveredEmptySlot === idx
                          ? "0 0 24px rgba(0,200,255,0.10), inset 0 0 24px rgba(0,200,255,0.04)"
                          : slotBaseStyle.boxShadow,
                      transition:
                        "border-color 180ms ease, box-shadow 180ms ease, transform 180ms ease, background 180ms ease",
                    }}
                  >
                    {/* Animated corner marks */}
                    <div
                      style={{
                        position: "absolute",
                        inset: 0,
                        animation: "slotIdlePulse 2.8s ease-in-out infinite",
                        pointerEvents: "none",
                      }}
                    >
                      <CardCorners
                        color={
                          hoveredEmptySlot === idx
                            ? "rgba(0,200,255,0.6)"
                            : "rgba(148,163,184,0.35)"
                        }
                      />
                    </div>

                    {/* Diagonal border overlays */}
                    <div
                      style={{
                        position: "absolute",
                        top: 0,
                        right: 0,
                        width: "14px",
                        height: "14px",
                        background:
                          hoveredEmptySlot === idx
                            ? "linear-gradient(to bottom right, transparent calc(50% - 0.6px), rgba(0,200,255,0.7) 50%, transparent calc(50% + 0.6px))"
                            : "linear-gradient(to bottom right, transparent calc(50% - 0.6px), rgba(148,163,184,0.25) 50%, transparent calc(50% + 0.6px))",
                        pointerEvents: "none",
                        transition: "background 180ms ease",
                      }}
                    />
                    <div
                      style={{
                        position: "absolute",
                        bottom: 0,
                        left: 0,
                        width: "14px",
                        height: "14px",
                        background:
                          hoveredEmptySlot === idx
                            ? "linear-gradient(to bottom right, transparent calc(50% - 0.6px), rgba(0,200,255,0.7) 50%, transparent calc(50% + 0.6px))"
                            : "linear-gradient(to bottom right, transparent calc(50% - 0.6px), rgba(148,163,184,0.25) 50%, transparent calc(50% + 0.6px))",
                        pointerEvents: "none",
                        transition: "background 180ms ease",
                      }}
                    />

                    {/* Watermark */}
                    <div
                      style={{
                        position: "absolute",
                        inset: 0,
                        display: "grid",
                        placeItems: "center",
                        opacity: 0.04,
                        pointerEvents: "none",
                        fontSize: "6rem",
                        fontFamily: "var(--font-display)",
                        fontWeight: 900,
                        color: "#7dd3fc",
                      }}
                    >
                      V
                    </div>

                    {/* Plus icon */}
                    <div
                      style={{
                        width: "48px",
                        height: "48px",
                        border:
                          hoveredEmptySlot === idx
                            ? "1px solid rgba(0,200,255,0.35)"
                            : "1px solid rgba(232,244,255,0.10)",
                        background:
                          hoveredEmptySlot === idx
                            ? "rgba(0,200,255,0.08)"
                            : "linear-gradient(180deg, rgba(255,255,255,0.03), rgba(255,255,255,0.01))",
                        clipPath:
                          "polygon(0 0, calc(100% - 8px) 0, 100% 8px, 100% 100%, 8px 100%, 0 calc(100% - 8px))",
                        display: "grid",
                        placeItems: "center",
                        color:
                          hoveredEmptySlot === idx
                            ? "rgba(0,200,255,0.8)"
                            : "rgba(232,244,255,0.30)",
                        transition: "all 180ms ease",
                      }}
                    >
                      <Plus size={18} />
                    </div>

                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        gap: "0.15rem",
                      }}
                    >
                      <div
                        style={{
                          color:
                            hoveredEmptySlot === idx
                              ? "rgba(0,200,255,0.7)"
                              : "rgba(232,244,255,0.25)",
                          fontFamily: "var(--font-display)",
                          fontWeight: 900,
                          fontSize: "0.66rem",
                          letterSpacing: "0.16em",
                          textTransform: "uppercase",
                          textAlign: "center",
                          transition: "color 180ms ease",
                        }}
                      >
                        Slot aliado
                      </div>
                      <div
                        style={{
                          color: "rgba(232,244,255,0.14)",
                          fontSize: "0.6rem",
                          letterSpacing: "0.06em",
                          textTransform: "uppercase",
                        }}
                      >
                        Invitar jugador
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div
            style={{
              border: "1px solid rgba(0,200,255,0.14)",
              background:
                "linear-gradient(180deg, rgba(0,200,255,0.08), rgba(17,25,39,0.78))",
              padding: "1rem",
              display: "grid",
              gap: "0.85rem",
              alignContent: "space-between",
            }}
          >
            <PanelTitle eyebrow="Matchmaking" title="Competitivo aleatorio" />

            <div
              style={{
                display: "grid",
                gridTemplateColumns:
                  matchmakingLayout === "stack" || isMd
                    ? "minmax(180px, 0.85fr) minmax(0, 1.15fr)"
                    : "1fr",
                gap: "0.8rem",
                alignItems: "stretch",
              }}
            >
              <button
                onClick={handleFindMatch}
                disabled={findMatchDisabled}
                style={{
                  width: "100%",
                  minHeight:
                    matchmakingLayout === "stack" || isMd ? "100%" : "50px",
                  border: findMatchDisabled
                    ? "1px solid rgba(148,163,184,0.26)"
                    : isSearching
                      ? "1px solid rgba(0,200,255,0.75)"
                      : "1px solid rgba(0,200,255,0.88)",
                  background: findMatchDisabled
                    ? "rgba(148,163,184,0.14)"
                    : isSearching
                      ? "rgba(0,200,255,0.06)"
                      : "linear-gradient(90deg, #00c8ff, #7dd3fc)",
                  color: findMatchDisabled
                    ? "#cbd5e1"
                    : isSearching
                      ? "#7dd3fc"
                      : "#020617",
                  fontFamily: "var(--font-display)",
                  fontWeight: 900,
                  fontSize: "0.92rem",
                  letterSpacing: "0.16em",
                  textTransform: "uppercase",
                  cursor: findMatchDisabled ? "not-allowed" : "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "0.65rem",
                  boxShadow: findMatchDisabled
                    ? "none"
                    : "0 0 28px rgba(0,200,255,0.12)",
                }}
              >
                {findMatchDisabled ? (
                  "Partida activa"
                ) : isSearching ? (
                  <>
                    <span
                      style={{
                        width: 10,
                        height: 10,
                        background: "#00c8ff",
                        animation: "blink 1s infinite",
                      }}
                    />
                    Cancelar búsqueda
                  </>
                ) : (
                  <>
                    <Search size={17} />
                    Buscar partida
                  </>
                )}
              </button>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns:
                    matchmakingLayout === "stack" || isMd
                      ? "repeat(3, minmax(0, 1fr))"
                      : "1fr",
                  gap: "0.55rem",
                }}
              >
                <QueueBriefStat
                  label={isAccepting ? "Confirmados" : "Buscando ahora"}
                  value={
                    isAccepting
                      ? `${acceptedCount}/${totalPendingPlayers}`
                      : `${queueOccupancy}/10`
                  }
                  sub={
                    isAccepting
                      ? currentUserAccepted
                        ? "Tu accept ya entró"
                        : "Falta tu confirmación"
                      : isSearching
                        ? "Jugadores visibles en cola"
                        : "Cola global en tiempo real"
                  }
                  tone={isAccepting ? queueStateMeta.tone : "#7dd3fc"}
                />
                <QueueBriefStat
                  label={isAccepting ? "Ventana" : "Espera"}
                  value={waitValue}
                  sub={
                    isAccepting
                      ? "Tiempo para aceptar"
                      : isSearching
                        ? "Tiempo en cola"
                        : "Sin búsqueda activa"
                  }
                  tone={isSearching || isAccepting ? "#4ade80" : "#94a3b8"}
                />
                <QueueBriefStat
                  label="Formato"
                  value={
                    MODES.find((mode) => mode.key === selectedMode)?.label ??
                    "Competitivo"
                  }
                  sub="SA · Draft · MMR activo"
                  tone={rankColor}
                />
              </div>
            </div>

            {hasActiveMatch && (
              <Notice
                tone="warn"
                text="No podés buscar otra partida hasta cerrar la actual."
              />
            )}
          </div>
        </section>

        <section style={panelStyle}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: "1rem",
              flexWrap: "wrap",
            }}
          >
            <PanelTitle eyebrow="Live queue" title={liveQueueTitle} />
            <div
              style={{
                color:
                  liveQueueState === "accepting"
                    ? "#fcd34d"
                    : liveQueueState === "blocked"
                      ? "#fb7185"
                      : "#7dd3fc",
                fontFamily: "var(--font-display)",
                fontWeight: 900,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
              }}
            >
              {liveQueueSignal}
            </div>
          </div>

          <div style={{ display: "grid", gap: "0.55rem" }}>
            {liveQueueState === "idle" ? (
              <Notice text="No hay jugadores en cola en este momento." />
            ) : liveQueueState === "warming" ? (
              <Notice text="Buscando snapshot inicial de cola. Si persiste, revisa conectividad realtime/polling." />
            ) : liveQueueState === "accepting" ? (
              <Notice
                tone="warn"
                text="Match encontrado. Confirmá desde el modal para evitar cancelación por timeout."
              />
            ) : liveQueueState === "blocked" ? (
              <Notice
                tone="warn"
                text="Ya hay una partida activa asociada a tu sesión. Reabrí el matchroom para continuar."
              />
            ) : queuePreviewForDisplay.length === 0 ? (
              <Notice text="Todavía no hay jugadores visibles en la cola." />
            ) : (
              queuePreviewForDisplay.map((entry, index) => (
                <div key={entry.userId} style={queueRowStyle}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.75rem",
                      minWidth: 0,
                    }}
                  >
                    <div style={queueAvatarStyle}>
                      {entry.username.slice(0, 2).toUpperCase()}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div
                        style={{
                          color: "#fff",
                          fontWeight: 800,
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {entry.username}{" "}
                        {entry.userId === user.id ? "(vos)" : ""}
                      </div>
                      <div
                        style={{
                          color: "rgba(232,244,255,0.34)",
                          fontSize: "0.78rem",
                        }}
                      >
                        #{index + 1} · {formatCompactRating(entry.mmr)} MMR ·{" "}
                        {entry.isBot ? "bot testing" : "usuario real"}
                      </div>
                      {!entry.isBot &&
                        entry.roles &&
                        entry.roles.length > 0 && (
                          <div
                            style={{
                              display: "flex",
                              gap: "0.35rem",
                              marginTop: "0.35rem",
                              flexWrap: "wrap",
                            }}
                          >
                            {entry.roles.map((role) => (
                              <RolePill
                                key={`${entry.userId}-${role}`}
                                role={role}
                                iconOnly
                              />
                            ))}
                          </div>
                        )}
                    </div>
                  </div>
                  <div
                    style={{
                      color: "rgba(232,244,255,0.48)",
                      fontSize: "0.8rem",
                      textAlign: "right",
                    }}
                  >
                    {entry.isBot
                      ? "Sistema"
                      : entry.joinedAt
                        ? `${Math.max(0, Math.floor((Date.now() - entry.joinedAt) / 1000))}s`
                        : "Esperando"}
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        <section style={panelStyle}>
          <button
            type="button"
            onClick={() => setLiveMatchesOpen((value) => !value)}
            style={{
              width: "100%",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: "1rem",
              flexWrap: "wrap",
              border: "none",
              background: "transparent",
              color: "inherit",
              cursor: "pointer",
              padding: 0,
              textAlign: "left",
            }}
          >
            <PanelTitle
              eyebrow="Nexus live rooms"
              title={`Partidas en curso · ${liveMatches.length}`}
            />
            <div
              style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}
            >
              <div
                style={{
                  color: liveMatches.length
                    ? "#7dd3fc"
                    : "rgba(232,244,255,0.38)",
                  fontFamily: "var(--font-display)",
                  fontSize: "0.86rem",
                  fontWeight: 900,
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                }}
              >
                {liveMatches.length ? "Observar rooms" : "Sin actividad"}
              </div>
              <ChevronDown
                size={16}
                style={{
                  color: "rgba(232,244,255,0.42)",
                  transform: liveMatchesOpen
                    ? "rotate(180deg)"
                    : "rotate(0deg)",
                  transition: "transform 160ms ease",
                  flexShrink: 0,
                }}
              />
            </div>
          </button>

          {liveMatchesOpen && (
            <div
              style={{ marginTop: "0.9rem", display: "grid", gap: "0.7rem" }}
            >
              {liveMatches.length === 0 ? (
                <Notice text="No hay matchrooms en vivo ahora. Cuando empiece un veto o una partida, va a aparecer acá para observar." />
              ) : (
                liveMatches.map((match) => (
                  <LiveMatchCard
                    key={match.id}
                    match={match}
                    onOpen={() =>
                      navigate({
                        to: "/match/$matchId",
                        params: { matchId: match.id },
                      })
                    }
                  />
                ))
              )}
            </div>
          )}
        </section>

        {hiddenActiveMatchId && (
          <section
            style={{
              ...panelStyle,
              borderColor: "rgba(251,191,36,0.25)",
              background: "rgba(251,191,36,0.07)",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: "1rem",
              }}
            >
              <div>
                <PanelTitle
                  eyebrow="Match activo oculto"
                  title="La partida sigue viva"
                />
                <div
                  style={{
                    color: "rgba(232,244,255,0.68)",
                    marginTop: "0.25rem",
                  }}
                >
                  Saliste del matchroom, pero podés volver cuando quieras.
                </div>
              </div>
              <button
                onClick={() => {
                  window.sessionStorage.removeItem(DISMISSED_ACTIVE_MATCH_KEY);
                  setDismissedActiveMatchId(null);
                  navigate({
                    to: "/match/$matchId",
                    params: { matchId: hiddenActiveMatchId },
                  });
                }}
                style={goldButtonStyle}
              >
                Reabrir match
              </button>
            </div>
          </section>
        )}

        <section style={panelStyle}>
          <button
            type="button"
            onClick={() => setIsOpsLogOpen((v) => !v)}
            style={{
              width: "100%",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: "1rem",
              flexWrap: "wrap",
              border: "none",
              background: "transparent",
              color: "inherit",
              cursor: "pointer",
              padding: 0,
              textAlign: "left",
            }}
          >
            <PanelTitle
              eyebrow="Live logs"
              title="Actividad operativa del matchmaking"
            />
            <div
              style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}
            >
              <div
                style={{
                  color: "rgba(232,244,255,0.42)",
                  fontSize: "0.78rem",
                  textTransform: "uppercase",
                  letterSpacing: "0.14em",
                  fontWeight: 800,
                }}
              >
                {opsEvents.length}/10
              </div>
              <ChevronDown
                size={16}
                style={{
                  color: "rgba(232,244,255,0.42)",
                  transform: isOpsLogOpen ? "rotate(180deg)" : "rotate(0deg)",
                  transition: "transform 160ms ease",
                  flexShrink: 0,
                }}
              />
            </div>
          </button>

          {isOpsLogOpen && (
            <div style={{ marginTop: "0.75rem" }}>
              {opsEvents.length === 0 ? (
                <Notice text="Todavía no hay eventos. Entrá a cola para empezar a registrar actividad en vivo." />
              ) : (
                <div style={{ display: "grid", gap: "0.55rem" }}>
                  {opsEvents.map((event) => (
                    <OpsEventRow key={event.id} event={event} />
                  ))}
                </div>
              )}
            </div>
          )}
        </section>

        {user.role === "ADMIN" && (
          <section
            style={{
              ...panelStyle,
              borderColor: "rgba(248,113,113,0.20)",
              background: "rgba(127,29,29,0.08)",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: "1rem",
                alignItems: "center",
                flexWrap: "wrap",
              }}
            >
              <PanelTitle
                eyebrow="Admin · Rescue panel"
                title="Control rápido de testing"
              />
              <div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap" }}>
                <button
                  onClick={handleAdminClearQueue}
                  disabled={adminFillingBots}
                  style={amberGhostButtonStyle}
                >
                  Limpiar cola
                </button>
                <button
                  onClick={handleAdminFillBots}
                  disabled={adminFillingBots}
                  style={blueGhostButtonStyle}
                >
                  {adminFillingBots
                    ? "Completando…"
                    : "Completar cola a 10 con bots"}
                </button>
              </div>
            </div>

            {adminError && <Notice tone="danger" text={adminError} />}

            {adminMatches.length === 0 ? (
              <Notice
                text={
                  adminLoading
                    ? "Actualizando matches…"
                    : "No hay matches activos o colgados ahora mismo."
                }
              />
            ) : (
              <div style={{ display: "grid", gap: "0.7rem" }}>
                {adminMatches.map((match) => {
                  const humanPlayers = match.players.filter(
                    (player) => !player.isBot,
                  );
                  const accepted = humanPlayers.filter(
                    (player) => player.accepted === true,
                  ).length;
                  return (
                    <div
                      key={match.id}
                      style={{
                        ...adminMatchStyle,
                        gridTemplateColumns: isSm
                          ? "1fr"
                          : isMd
                            ? "minmax(0, 1fr) auto"
                            : adminMatchStyle.gridTemplateColumns,
                      }}
                    >
                      <div style={{ minWidth: 0 }}>
                        <div style={{ color: "#fff", fontWeight: 900 }}>
                          {match.status} · {match.id.slice(0, 8)}
                        </div>
                        <div
                          style={{
                            color: "rgba(232,244,255,0.42)",
                            fontSize: "0.82rem",
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                        >
                          {match.players
                            .map(
                              (player) =>
                                player.user?.username ??
                                player.botName ??
                                player.userId?.slice(0, 6) ??
                                "Bot",
                            )
                            .join(" · ")}
                        </div>
                      </div>
                      <div
                        style={{
                          color: "rgba(232,244,255,0.62)",
                          fontSize: "0.82rem",
                          textAlign: "right",
                        }}
                      >
                        {match.status === "ACCEPTING"
                          ? `Aceptaron ${accepted}/${humanPlayers.length}`
                          : match.selectedMap
                            ? `Mapa: ${match.selectedMap}`
                            : "Sin mapa"}
                      </div>
                      <div
                        style={{
                          display: "flex",
                          gap: "0.5rem",
                          justifyContent: "flex-end",
                        }}
                      >
                        <button
                          onClick={() => handleAdminCancelMatch(match.id)}
                          disabled={adminActionMatchId === match.id}
                          style={amberGhostButtonStyle}
                        >
                          Cancelar
                        </button>
                        <button
                          onClick={() => handleAdminDeleteMatch(match.id)}
                          disabled={adminActionMatchId === match.id}
                          style={redGhostButtonStyle}
                        >
                          Borrar
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}
      </section>
    </>
  );
}

type Tone = "default" | "warn" | "danger";

function PanelTitle({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div>
      <div
        style={{
          color: "rgba(232,244,255,0.30)",
          fontSize: "0.68rem",
          letterSpacing: "0.2em",
          textTransform: "uppercase",
          fontWeight: 900,
        }}
      >
        {eyebrow}
      </div>
      <div
        style={{
          color: "#fff",
          fontFamily: "var(--font-display)",
          fontSize: "1.2rem",
          fontWeight: 900,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          marginTop: "0.12rem",
        }}
      >
        {title}
      </div>
    </div>
  );
}

function QueueBriefStat({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string | number;
  sub: string;
  tone: string;
}) {
  return (
    <div
      style={{
        border: "1px solid rgba(232,244,255,0.08)",
        background:
          "linear-gradient(180deg, rgba(2,6,14,0.62), rgba(2,6,14,0.38))",
        padding: "0.72rem 0.8rem",
        minWidth: 0,
      }}
    >
      <div
        style={{
          color: "rgba(232,244,255,0.34)",
          fontSize: "0.64rem",
          textTransform: "uppercase",
          letterSpacing: "0.16em",
          fontWeight: 900,
        }}
      >
        {label}
      </div>
      <div
        style={{
          color: tone,
          fontFamily: "var(--font-display)",
          fontSize: "1.12rem",
          fontWeight: 900,
          lineHeight: 1.05,
          marginTop: "0.22rem",
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {value}
      </div>
      <div
        style={{
          color: "rgba(232,244,255,0.48)",
          fontSize: "0.72rem",
          lineHeight: 1.35,
          marginTop: "0.26rem",
        }}
      >
        {sub}
      </div>
    </div>
  );
}

function LiveMatchCard({
  match,
  onOpen,
}: {
  match: LiveMatchRow;
  onOpen: () => void;
}) {
  const teamOne = match.teams[1] ?? [];
  const teamTwo = match.teams[2] ?? [];
  const teamOneCaptain = teamOne.find((player) => player.isCaptain);
  const teamTwoCaptain = teamTwo.find((player) => player.isCaptain);
  const statusMeta = getLiveMatchStatusMeta(match.status);
  const totalPlayers = teamOne.length + teamTwo.length;
  const avgMmr =
    totalPlayers > 0
      ? Math.round(
          [...teamOne, ...teamTwo].reduce(
            (sum, player) => sum + player.mmr,
            0,
          ) / totalPlayers,
        )
      : 0;

  return (
    <div
      style={{
        border: `1px solid ${statusMeta.tone}2e`,
        background:
          "linear-gradient(135deg, rgba(2,6,14,0.82), rgba(15,23,42,0.72))",
        padding: "0.9rem",
        display: "grid",
        gridTemplateColumns: "minmax(0, 1fr) auto",
        gap: "0.9rem",
        alignItems: "center",
      }}
    >
      <div style={{ display: "grid", gap: "0.7rem", minWidth: 0 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: "0.75rem",
            flexWrap: "wrap",
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                color: statusMeta.tone,
                fontSize: "0.68rem",
                fontWeight: 900,
                letterSpacing: "0.18em",
                textTransform: "uppercase",
              }}
            >
              {statusMeta.label} · {match.region}
              {match.viewerTeam ? ` · Tu equipo ${match.viewerTeam}` : ""}
            </div>
            <div
              style={{
                color: "#fff",
                fontFamily: "var(--font-display)",
                fontSize: "1rem",
                fontWeight: 900,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                marginTop: "0.15rem",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {teamOneCaptain?.username ?? "Team Azul"} vs{" "}
              {teamTwoCaptain?.username ?? "Team Rojo"}
            </div>
          </div>
          <div
            style={{
              color: "rgba(232,244,255,0.46)",
              fontSize: "0.78rem",
              fontWeight: 800,
              textAlign: "right",
            }}
          >
            {match.selectedMap ?? "Mapa pendiente"} · {avgMmr} MMR avg
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1fr) auto minmax(0, 1fr)",
            gap: "0.7rem",
            alignItems: "center",
          }}
        >
          <LiveTeamPreview team={teamOne} color="#00c8ff" align="left" />
          <div
            style={{
              color: "rgba(232,244,255,0.24)",
              fontFamily: "var(--font-display)",
              fontWeight: 900,
              letterSpacing: "0.2em",
              textTransform: "uppercase",
            }}
          >
            VS
          </div>
          <LiveTeamPreview team={teamTwo} color="#ff4757" align="right" />
        </div>

        <div
          style={{
            display: "flex",
            gap: "0.45rem",
            flexWrap: "wrap",
            color: "rgba(232,244,255,0.48)",
            fontSize: "0.76rem",
            fontWeight: 700,
          }}
        >
          <span>{totalPlayers}/10 jugadores</span>
          <span>·</span>
          <span>
            Conectados {match.readyCount}/{match.totalPlayers}
          </span>
          {match.status === "VOTING" && (
            <>
              <span>·</span>
              <span>
                Votos {match.voteCounts.total}/{match.totalPlayers}
              </span>
            </>
          )}
          <span>·</span>
          <span>ID {match.id.slice(0, 8)}</span>
        </div>
      </div>

      <button onClick={onOpen} style={spectateButtonStyle}>
        Ver room
      </button>
    </div>
  );
}

function LiveTeamPreview({
  team,
  color,
  align,
}: {
  team: LiveMatchRow["teams"][1];
  color: string;
  align: "left" | "right";
}) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: align === "left" ? "flex-start" : "flex-end",
        alignItems: "center",
        gap: "0.35rem",
        minWidth: 0,
      }}
    >
      {team.slice(0, 5).map((player) => (
        <div
          key={player.userId ?? player.username}
          title={player.username}
          style={{
            width: "30px",
            height: "30px",
            border: `1px solid ${player.isCaptain ? color : "rgba(232,244,255,0.12)"}`,
            background: player.isCaptain ? `${color}22` : "rgba(2,6,14,0.72)",
            color: player.isCaptain ? color : "rgba(232,244,255,0.72)",
            display: "grid",
            placeItems: "center",
            fontFamily: "var(--font-display)",
            fontSize: "0.7rem",
            fontWeight: 900,
            clipPath:
              "polygon(0 0, calc(100% - 7px) 0, 100% 7px, 100% 100%, 7px 100%, 0 calc(100% - 7px))",
          }}
        >
          {player.username.slice(0, 2).toUpperCase()}
        </div>
      ))}
    </div>
  );
}

function getLiveMatchStatusMeta(status: LiveMatchRow["status"]) {
  switch (status) {
    case "VETOING":
      return { label: "Veto en vivo", tone: "#7dd3fc" };
    case "PLAYING":
      return { label: "Jugando", tone: "#4ade80" };
    case "VOTING":
      return { label: "Votando resultado", tone: "#c084fc" };
  }
}

function RolePill({
  role,
  muted,
  iconOnly,
}: {
  role: string;
  muted?: boolean;
  iconOnly?: boolean;
}) {
  const meta = getRoleMeta(role);
  const iconSources = getRoleIconSources(role);
  const color = meta?.accent ?? "rgba(232,244,255,0.34)";
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "0.32rem",
        border: `1px solid ${muted ? "rgba(232,244,255,0.12)" : `${color}66`}`,
        background: muted ? "rgba(255,255,255,0.03)" : `${color}16`,
        color: muted ? "rgba(232,244,255,0.42)" : color,
        padding: iconOnly ? "0.22rem" : "0.28rem 0.45rem",
        fontFamily: "var(--font-display)",
        fontSize: "0.62rem",
        fontWeight: 900,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
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
            width: iconOnly ? "17px" : "15px",
            height: iconOnly ? "17px" : "15px",
            objectFit: "contain",
            filter: `drop-shadow(0 0 5px ${color}66)`,
          }}
        />
      )}
      {iconOnly ? null : (meta?.label ?? role)}
    </span>
  );
}

function LayoutToggleButton({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        border: "none",
        borderRight:
          label === "Compacto" ? "1px solid rgba(232,244,255,0.08)" : "none",
        background: active ? "rgba(0,200,255,0.14)" : "transparent",
        color: active ? "#7dd3fc" : "rgba(232,244,255,0.42)",
        padding: "0.45rem 0.65rem",
        fontFamily: "var(--font-display)",
        fontSize: "0.68rem",
        fontWeight: 900,
        letterSpacing: "0.12em",
        textTransform: "uppercase",
        cursor: "pointer",
      }}
    >
      {label}
    </button>
  );
}

function Notice({ text, tone = "default" }: { text: string; tone?: Tone }) {
  const palette =
    tone === "danger"
      ? {
          border: "rgba(248,113,113,0.28)",
          bg: "rgba(127,29,29,0.13)",
          color: "#fecaca",
        }
      : tone === "warn"
        ? {
            border: "rgba(251,191,36,0.28)",
            bg: "rgba(251,191,36,0.10)",
            color: "#fde68a",
          }
        : {
            border: "rgba(232,244,255,0.09)",
            bg: "rgba(255,255,255,0.025)",
            color: "rgba(232,244,255,0.54)",
          };
  return (
    <div
      style={{
        border: `1px solid ${palette.border}`,
        background: palette.bg,
        color: palette.color,
        padding: "0.8rem 0.9rem",
        fontSize: "0.86rem",
      }}
    >
      {text}
    </div>
  );
}

function OpsEventRow({ event }: { event: OpsEvent }) {
  const palette =
    event.tone === "good"
      ? {
          border: "rgba(74,222,128,0.22)",
          bg: "rgba(21,128,61,0.12)",
          dot: "#4ade80",
          title: "#bbf7d0",
        }
      : event.tone === "warn"
        ? {
            border: "rgba(251,191,36,0.24)",
            bg: "rgba(251,191,36,0.10)",
            dot: "#fbbf24",
            title: "#fde68a",
          }
        : {
            border: "rgba(232,244,255,0.09)",
            bg: "rgba(255,255,255,0.03)",
            dot: "#7dd3fc",
            title: "#e2e8f0",
          };

  return (
    <div
      style={{
        border: `1px solid ${palette.border}`,
        background: palette.bg,
        padding: "0.65rem 0.8rem",
        display: "grid",
        gap: "0.24rem",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "0.65rem",
        }}
      >
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.45rem",
            minWidth: 0,
          }}
        >
          <span
            style={{
              width: "8px",
              height: "8px",
              borderRadius: "999px",
              background: palette.dot,
              boxShadow: `0 0 10px ${palette.dot}66`,
              flexShrink: 0,
            }}
          />
          <span
            style={{
              color: palette.title,
              fontWeight: 800,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {event.title}
          </span>
        </div>
        <span
          style={{
            color: "rgba(232,244,255,0.40)",
            fontSize: "0.74rem",
            fontFamily: "var(--font-mono, monospace)",
          }}
        >
          {formatEventTime(event.at)}
        </span>
      </div>
      <div
        style={{
          color: "rgba(232,244,255,0.56)",
          fontSize: "0.82rem",
          lineHeight: 1.35,
        }}
      >
        {event.detail}
      </div>
    </div>
  );
}

function StatPanel({
  label,
  value,
  sub,
  tone,
  iconSrc,
}: {
  label: string;
  value: string;
  sub: string;
  tone: string;
  iconSrc?: string;
}) {
  return (
    <div
      style={{
        ...panelStyle,
        position: "relative",
        overflow: "hidden",
        minHeight: "132px",
        padding: "1rem 1rem 0.95rem",
        borderColor: `${tone}33`,
        background:
          `radial-gradient(circle at 84% 20%, ${tone}24, transparent 32%), ` +
          "linear-gradient(180deg, rgba(17,25,39,0.88), rgba(5,10,20,0.76))",
        boxShadow: `inset 0 1px 0 rgba(255,255,255,0.05), 0 18px 40px ${tone}0f`,
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: "0 0 auto 0",
          height: "2px",
          background: `linear-gradient(90deg, transparent, ${tone}, transparent)`,
          opacity: 0.78,
        }}
      />

      <div
        style={{
          position: "relative",
          zIndex: 1,
          width: iconSrc ? "calc(100% - 4rem)" : "100%",
          color: "var(--nexus-faint)",
          fontSize: "0.68rem",
          textTransform: "uppercase",
          letterSpacing: "0.16em",
          fontWeight: 900,
          marginLeft: "0.5rem",
        }}
      >
        {label}
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-start",
          gap: "1rem",
          zIndex: 1,
          color: tone,
          fontFamily: "var(--font-display)",
          fontSize: "2rem",
          lineHeight: 1,
          fontWeight: 900,
          marginTop: "0.35rem",
          textShadow: `0 0 22px ${tone}55`,
        }}
      >
        {iconSrc && (
          <img
            src={iconSrc}
            alt=""
            loading="lazy"
            decoding="async"
            style={{
              width: "80px",
              height: "80px",
              objectFit: "contain",
              filter: `drop-shadow(0 0 12px ${tone}66)`,
            }}
          />
        )}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-start",
            justifyContent: "flex-start",
          }}
        >
          {value}
          <div
            style={{
              zIndex: 1,
              color: "rgba(232,244,255,0.36)",
              fontSize: "0.8rem",
              marginTop: "0.25rem",
              lineHeight: 1.35,
            }}
          >
            {sub}
          </div>
        </div>
      </div>

      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          right: "-24px",
          bottom: "-30px",
          width: "120px",
          height: "120px",
          borderRadius: "999px",
          border: `1px solid ${tone}16`,
        }}
      />
    </div>
  );
}

const panelStyle: React.CSSProperties = {
  border: "1px solid rgba(232,244,255,0.07)",
  background:
    "linear-gradient(180deg, rgba(17,25,39,0.76), rgba(8,12,20,0.66))",
  padding: "1rem",
};

const slotBaseStyle: React.CSSProperties = {
  minHeight: "250px",
  position: "relative",
  overflow: "hidden",
  border: "1px solid rgba(148,163,184,0.12)",
  background: "linear-gradient(180deg, rgba(10,16,28,0.94), rgba(4,8,18,0.92))",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: "0.75rem",
  padding: "1rem",
  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.03)",
};

const queueRowStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: "0.9rem",
  border: "1px solid rgba(232,244,255,0.07)",
  background: "rgba(2,6,14,0.42)",
  padding: "0.75rem 0.85rem",
};

const queueAvatarStyle: React.CSSProperties = {
  width: "34px",
  height: "34px",
  borderRadius: "999px",
  border: "1px solid rgba(0,200,255,0.25)",
  display: "grid",
  placeItems: "center",
  color: "#7dd3fc",
  fontFamily: "var(--font-display)",
  fontWeight: 900,
  background: "rgba(0,200,255,0.08)",
  flexShrink: 0,
};

const goldButtonStyle: React.CSSProperties = {
  border: "1px solid rgba(251,191,36,0.55)",
  background: "#fbbf24",
  color: "#111827",
  padding: "0.8rem 1rem",
  fontWeight: 900,
  cursor: "pointer",
};

const spectateButtonStyle: React.CSSProperties = {
  border: "1px solid rgba(125,211,252,0.42)",
  background: "rgba(14,116,144,0.18)",
  color: "#bae6fd",
  padding: "0.72rem 0.9rem",
  fontFamily: "var(--font-display)",
  fontSize: "0.76rem",
  fontWeight: 900,
  letterSpacing: "0.14em",
  textTransform: "uppercase",
  cursor: "pointer",
  whiteSpace: "nowrap",
};

const blueGhostButtonStyle: React.CSSProperties = {
  border: "1px solid rgba(125,211,252,0.4)",
  background: "rgba(14,116,144,0.25)",
  color: "#bae6fd",
  padding: "0.65rem 0.9rem",
  fontWeight: 900,
  cursor: "pointer",
};

const amberGhostButtonStyle: React.CSSProperties = {
  border: "1px solid rgba(251,191,36,0.35)",
  background: "rgba(251,191,36,0.10)",
  color: "#fde68a",
  padding: "0.6rem 0.8rem",
  fontWeight: 900,
  cursor: "pointer",
};

const redGhostButtonStyle: React.CSSProperties = {
  border: "1px solid rgba(248,113,113,0.35)",
  background: "rgba(248,113,113,0.10)",
  color: "#fecaca",
  padding: "0.6rem 0.8rem",
  fontWeight: 900,
  cursor: "pointer",
};

const adminMatchStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) auto auto",
  alignItems: "center",
  gap: "0.9rem",
  border: "1px solid rgba(232,244,255,0.07)",
  background: "rgba(15,23,42,0.72)",
  padding: "0.85rem",
};
