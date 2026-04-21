import { useState, useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useAuthStore } from "../stores/auth.store";
import { useMatchmakingStore } from "../stores/matchmaking.store";
import { api } from "../lib/api";
import { getSocket } from "../lib/socket";
import { reportClientError } from "../lib/monitoring";
import { RankBadge } from "../components/RankBadge";
import { PlayerSlotShell } from "../components/PlayerSlotShell";
import { MatchFoundModal } from "../components/matchmaking/MatchFoundModal";
import {
  Activity,
  Plus,
  Radio,
  Search,
  ShieldCheck,
  TimerReset,
} from "lucide-react";
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

function formatCountdown(seconds: number) {
  return `0:${String(Math.max(0, seconds)).padStart(2, "0")}`;
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
  const [queueRoles, setQueueRoles] = useState<string[]>([]);
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
    const socket = getSocket();
    socket.on("matchmaking:found", (data: any) => {
      setHasActiveMatch(true);
      setMatchFound(data);
    });
    socket.on("veto:start", () => {
      if (pendingMatch?.matchId) {
        clearPendingMatch();
        navigate({
          to: "/match/$matchId",
          params: { matchId: pendingMatch.matchId },
        });
      }
    });
    socket.on("matchmaking:cancelled", () => {
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
        setQueueProgress({
          position: payload?.position,
          etaSeconds: payload?.etaSeconds,
        });
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
  ]);

  useEffect(() => {
    api
      .get<{
        inQueue: boolean;
        queueSize?: number;
        mode?: string;
        roles?: string[];
        joinedAt?: number;
      }>("/matchmaking/queue/status")
      .then(({ data }) => {
        if (!data.inQueue) {
          setQueueRoles([]);
          if (!pendingMatch && !hasActiveMatch) {
            resetMatchmaking();
          }
          return;
        }
        if (data.mode) setSelectedMode(data.mode);
        if (data.roles) setQueueRoles(data.roles);
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

    if (status !== "searching") {
      setQueuePreview([]);
      return;
    }

    loadQueueSnapshot();
    const interval = setInterval(loadQueueSnapshot, 5000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [setQueueProgress, setQueueSize, status, user?.id]);

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

  async function handleFindMatch() {
    if (hasActiveMatch) return;

    if (status === "searching") {
      await api.post("/matchmaking/queue/leave");
      setQueueRoles([]);
      stopSearching();
      return;
    }
    try {
      await api.post("/matchmaking/queue/join", {
        mode: selectedMode,
      });
      setQueueRoles(profileRoles);
      startSearching();
    } catch (err: any) {
      console.error("Queue error:", err.response?.data);
      reportClientError(err, "dashboard.queue.join_leave");
    }
  }

  async function handleAdminCancelMatch(matchId: string) {
    try {
      setAdminActionMatchId(matchId);
      await api.patch(`/admin/matches/${matchId}/cancel`);
      setAdminMatches((prev) => prev.filter((match) => match.id !== matchId));
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
    } finally {
      setAdminActionMatchId(null);
    }
  }

  async function handleAdminDeleteMatch(matchId: string) {
    try {
      setAdminActionMatchId(matchId);
      await api.delete(`/admin/matches/${matchId}`);
      setAdminMatches((prev) => prev.filter((match) => match.id !== matchId));
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
    } finally {
      setAdminActionMatchId(null);
    }
  }

  async function handleAdminFillBots() {
    try {
      setAdminFillingBots(true);
      setAdminError(null);
      await api.post("/admin/queue/fill-bots", { targetSize: 10 });
    } catch (err: any) {
      setAdminError(
        err.response?.data?.error?.message ??
          "No pude completar la cola con bots.",
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
      setQueueRoles([]);
      resetMatchmaking();
    } catch (err: any) {
      setAdminError(
        err.response?.data?.error?.message ?? "No pude limpiar la cola.",
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
  const activeQueueRoles = queueRoles.length > 0 ? queueRoles : profileRoles;
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
  const queuePhase = queueStateMeta.phase;

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
              "linear-gradient(135deg, rgba(0,200,255,0.10), rgba(124,77,255,0.06) 42%, rgba(2,6,14,0.92)), url('/images/BC-2018-1_1920x1200.jpg') center/cover",
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

              <div
                style={{
                  minWidth: "160px",
                  border: `1px solid ${queueStateMeta.tone}66`,
                  background: "rgba(2,6,14,0.72)",
                  padding: "0.9rem 1rem",
                  textAlign: "right",
                }}
              >
                <div
                  style={{
                    color: "rgba(232,244,255,0.42)",
                    fontSize: "0.68rem",
                    textTransform: "uppercase",
                    letterSpacing: "0.18em",
                    fontWeight: 800,
                  }}
                >
                  Estado
                </div>
                <div
                  style={{
                    color: queueStateMeta.tone,
                    fontFamily: "var(--font-display)",
                    fontSize: "1.35rem",
                    fontWeight: 900,
                    letterSpacing: "0.08em",
                  }}
                >
                  {queuePhase}
                </div>
                <div
                  style={{
                    marginTop: "0.28rem",
                    color: "rgba(232,244,255,0.46)",
                    fontSize: "0.74rem",
                    fontWeight: 700,
                  }}
                >
                  {queueStateMeta.stage
                    ? `${queueStateMeta.stage} · ${queueStateMeta.signal}`
                    : queueStateMeta.signal}
                </div>
              </div>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(4, minmax(120px, 1fr))",
                gap: "0.7rem",
              }}
            >
              <HeroMetric
                label="Modo"
                value={
                  MODES.find((m) => m.key === selectedMode)?.label ??
                  "Competitivo"
                }
                tone="#38bdf8"
              />
              <HeroMetric
                label={isAccepting ? "Accept" : "Cola"}
                value={
                  isAccepting
                    ? `${acceptedCount}/${totalPendingPlayers}`
                    : `${queueSize ?? 0}/10`
                }
                tone={isAccepting ? queueStateMeta.tone : "#a78bfa"}
              />
              <HeroMetric
                label={isAccepting ? "Tu estado" : "Posición"}
                value={
                  isAccepting
                    ? currentUserAccepted
                      ? "OK"
                      : "Pendiente"
                    : (queuePosition ?? "—")
                }
                tone={
                  isAccepting
                    ? currentUserAccepted
                      ? "#4ade80"
                      : "#f8fafc"
                    : "#facc15"
                }
              />
              <HeroMetric
                label={isAccepting ? "Ventana" : "Espera"}
                value={
                  isAccepting
                    ? acceptCountdown != null
                      ? formatCountdown(acceptCountdown)
                      : "—"
                    : queueEtaSeconds != null
                      ? `~${queueEtaSeconds}s`
                      : "—"
                }
                tone={isAccepting ? queueStateMeta.tone : "#4ade80"}
              />
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                gap: "0.7rem",
              }}
            >
              <QueueSignalCard
                icon={<Activity size={16} />}
                label="Estado operativo"
                value={queueStateMeta.phase}
                sub={
                  queueStateMeta.stage
                    ? `${queueStateMeta.stage} · ${queueStateMeta.detail}`
                    : queueStateMeta.detail
                }
                tone={queueStateMeta.tone}
              />
              <QueueSignalCard
                icon={<Radio size={16} />}
                label="Roles activos"
                value={
                  activeQueueRoles.length > 0
                    ? activeQueueRoles.join(" · ")
                    : "Perfil sin roles"
                }
                sub="El matchmaking usa tu identidad competitiva real."
                tone={rankColor}
              />
              <QueueSignalCard
                icon={
                  isAccepting ? (
                    <ShieldCheck size={16} />
                  ) : (
                    <TimerReset size={16} />
                  )
                }
                label="Próxima acción"
                value={
                  hasActiveMatch
                    ? "Volver al room"
                    : isAccepting
                      ? "Confirmar"
                      : isSearching
                        ? `Elapsed ${formatElapsed(elapsed)}`
                        : "Buscar partida"
                }
                sub={
                  hasActiveMatch
                    ? "Tenés una partida viva esperando continuidad."
                    : isAccepting
                      ? "Aceptá desde el modal antes de que cierre la ventana."
                      : isSearching
                        ? "Seguí en cola mientras balanceamos MMR y slots."
                        : "Todo listo para entrar a la cola competitiva."
                }
                tone={
                  hasActiveMatch
                    ? "#22c55e"
                    : isAccepting
                      ? queueStateMeta.tone
                      : isSearching
                        ? "#38bdf8"
                        : "#cbd5e1"
                }
              />
            </div>
          </div>
        </header>

        <section
          style={{
            display: "grid",
            gridTemplateColumns:
              matchmakingLayout === "stack"
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
                gridTemplateColumns: "repeat(5, minmax(90px, 1fr))",
                gap: matchmakingLayout === "stack" ? "0.9rem" : "0.7rem",
              }}
            >
              {SLOT_ORDER.map((idx) => {
                const isYou = idx === 2;
                return isYou ? (
                  <PlayerSlotShell key="you" color={rankColor} minHeight={320}>
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        gap: "0.5rem",
                      }}
                    >
                      <div
                        style={{
                          border: `1px solid ${rankColor}55`,
                          background: `${rankColor}12`,
                          color: rankColor,
                          padding: "2px 8px",
                          fontSize: "10px",
                          fontWeight: 900,
                          letterSpacing: "0.18em",
                          textTransform: "uppercase",
                        }}
                      >
                        Tú
                      </div>

                      <div
                        style={{
                          width: "68px",
                          height: "68px",
                          borderRadius: "999px",
                          overflow: "hidden",
                          border: `2px solid ${rankColor}`,
                          boxShadow: `0 0 16px ${rankColor}33`,
                          display: "grid",
                          placeItems: "center",
                          color: rankColor,
                          fontFamily: "var(--font-display)",
                          fontWeight: 900,
                          background: "rgba(255,255,255,0.05)",
                        }}
                      >
                        {user.avatar && !avatarLoadError ? (
                          <img
                            src={user.avatar}
                            alt={user.username}
                            onError={() => setAvatarLoadError(true)}
                            style={{ width: "100%", height: "100%", objectFit: "cover" }}
                          />
                        ) : (
                          user.username.slice(0, 2).toUpperCase()
                        )}
                      </div>

                      <div
                        style={{
                          color: "#fff",
                          fontSize: "1.1rem",
                          fontWeight: 800,
                        }}
                      >
                        {user.username}
                      </div>
                    </div>

                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        gap: "0.4rem",
                      }}
                    >
                      <RankBadge
                        level={level}
                        size="lg"
                        align="center"
                        showLabel={false}
                        showMmr={false}
                        glow="medium"
                      />

                      <div
                        style={{
                          color: rankColor,
                          fontWeight: 900,
                          letterSpacing: "0.14em",
                          textTransform: "uppercase",
                          textShadow: `0 0 10px ${rankColor}33`,
                        }}
                      >
                        {rankMeta.label}
                      </div>

                      <div
                        style={{
                          color: "rgba(255,255,255,0.85)",
                          fontSize: "0.85rem",
                          fontWeight: 700,
                        }}
                      >
                        {user.mmr.toLocaleString("es-AR")} MMR
                      </div>
                    </div>

                    <div style={{ display: "flex", gap: "0.5rem" }}>
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
                    onMouseLeave={() => setHoveredEmptySlot((current) => (current === idx ? null : current))}
                    style={{
                      ...slotBaseStyle,
                      minHeight:
                        matchmakingLayout === "stack"
                          ? "290px"
                          : slotBaseStyle.minHeight,
                      border:
                        hoveredEmptySlot === idx
                          ? "1px solid rgba(125, 211, 252, 0.22)"
                          : "1px solid rgba(148,163,184,0.10)",
                      background:
                        "linear-gradient(180deg, rgba(8,12,22,0.9), rgba(3,6,14,0.92))",
                      transform:
                        hoveredEmptySlot === idx
                          ? "translateY(-2px)"
                          : "translateY(0)",
                      boxShadow:
                        hoveredEmptySlot === idx
                          ? "0 0 18px rgba(56, 189, 248, 0.08)"
                          : slotBaseStyle.boxShadow,
                      transition:
                        "border-color 180ms ease, box-shadow 180ms ease, transform 180ms ease",
                    }}
                  >
                    <CardCorners color="rgba(148,163,184,0.16)" />

                    <div
                      style={{
                        position: "absolute",
                        inset: 0,
                        display: "grid",
                        placeItems: "center",
                        opacity: 0.06,
                        pointerEvents: "none",
                        fontSize: "7rem",
                        fontFamily: "var(--font-display)",
                        fontWeight: 900,
                        color: "#7dd3fc",
                      }}
                    >
                      V
                    </div>

                    <div
                      style={{
                        width: "52px",
                        height: "52px",
                        border: "1px solid rgba(232,244,255,0.12)",
                        background:
                          "linear-gradient(180deg, rgba(255,255,255,0.03), rgba(255,255,255,0.01))",
                        display: "grid",
                        placeItems: "center",
                        color: "rgba(232,244,255,0.42)",
                        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04)",
                        transition: "all 180ms ease",
                      }}
                    >
                      <Plus size={20} />
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
                          color: "rgba(232,244,255,0.28)",
                          fontFamily: "var(--font-display)",
                          fontWeight: 900,
                          fontSize: "0.68rem",
                          letterSpacing: "0.14em",
                          textTransform: "uppercase",
                          textAlign: "center",
                        }}
                      >
                        Slot aliado
                      </div>

                      <div
                        style={{
                          color: "rgba(232,244,255,0.16)",
                          fontSize: "0.62rem",
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
            {/* 
            <div
              style={{
                border: "1px solid rgba(0,200,255,0.13)",
                background: "rgba(0,200,255,0.04)",
                padding: "0.85rem 1rem",
                display: "grid",
                gap: "0.55rem",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
                <div>
                  <div style={{ color: "#7dd3fc", fontSize: "0.68rem", letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 900 }}>
                    Flujo manual HOTS
                  </div>
                  <div style={{ color: "rgba(232,244,255,0.76)", fontSize: "0.9rem", marginTop: "0.2rem" }}>
                    El sistema arma sala, define capitanes, ejecuta veto y registra resultado por votación.
                  </div>
                </div>
                <div style={{ display: "flex", gap: "0.45rem", flexWrap: "wrap" }}>
                  {profileRoles.length === 0 ? (
                    <RolePill role="Configura tus roles en Perfil" muted />
                  ) : (
                    profileRoles.map((role) => <RolePill key={role} role={role} />)
                  )}
                </div>
              </div>
            </div> */}
          </div>

          <div
            style={{
              border: "1px solid rgba(0,200,255,0.14)",
              background:
                "linear-gradient(180deg, rgba(0,200,255,0.08), rgba(17,25,39,0.78))",
              padding: "1rem",
              display: "grid",
              gap: "1rem",
              alignContent: "space-between",
            }}
          >
            <PanelTitle eyebrow="Matchmaking" title="Competitivo aleatorio" />

            <div
              style={{
                border: "1px solid rgba(232,244,255,0.07)",
                background: "rgba(2,6,14,0.36)",
                padding: "0.9rem",
                display: "grid",
                gap: "0.6rem",
              }}
            >
              <div
                style={{
                  color: "#7dd3fc",
                  fontFamily: "var(--font-display)",
                  fontWeight: 900,
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                }}
              >
                5v5 · Draft · MMR activo
              </div>
              <div
                style={{
                  color: "rgba(232,244,255,0.58)",
                  fontSize: "0.86rem",
                  lineHeight: 1.45,
                }}
              >
                Entrás solo o en party chica. El sistema completa la sala,
                balancea MMR y abre veto en vivo.
              </div>
            </div>

            <div
              style={{
                border: "1px solid rgba(232,244,255,0.07)",
                background: "rgba(2,6,14,0.36)",
                padding: "0.9rem",
                display: "grid",
                gap: "0.6rem",
              }}
            >
              <div
                style={{
                  color: "rgba(232,244,255,0.38)",
                  fontSize: "0.7rem",
                  letterSpacing: "0.16em",
                  textTransform: "uppercase",
                  fontWeight: 900,
                }}
              >
                Roles usados para entrar
              </div>
              <div
                style={{
                  color: "rgba(232,244,255,0.62)",
                  fontSize: "0.84rem",
                  lineHeight: 1.45,
                }}
              >
                La cola usa tus roles guardados en perfil, sin selección manual.
              </div>
              <div
                style={{
                  display: "flex",
                  gap: "0.45rem",
                  flexWrap: "wrap",
                }}
              >
                {activeQueueRoles.length > 0 ? (
                  activeQueueRoles.map((role) => (
                    <RolePill key={role} role={role} />
                  ))
                ) : (
                  <RolePill role="Completa onboarding" muted />
                )}
              </div>
            </div>

            <button
              onClick={handleFindMatch}
              disabled={findMatchDisabled}
              style={{
                width: "100%",
                minHeight: "58px",
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
                fontSize: "1rem",
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                cursor: findMatchDisabled ? "not-allowed" : "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "0.7rem",
                boxShadow: findMatchDisabled
                  ? "none"
                  : "0 0 28px rgba(0,200,255,0.12)",
              }}
            >
              {findMatchDisabled ? (
                "Partida activa en curso"
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
                  Buscando {formatElapsed(elapsed)} · cancelar
                </>
              ) : (
                <>
                  <Search size={18} />
                  Buscar partida
                </>
              )}
            </button>

            {hasActiveMatch && (
              <Notice
                tone="warn"
                text="No podés buscar otra partida hasta cerrar la actual."
              />
            )}
          </div>
        </section>

        {isSearching && (
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
              <PanelTitle
                eyebrow="Live queue"
                title="Jugadores buscando partida"
              />
              <div
                style={{
                  color: "#7dd3fc",
                  fontFamily: "var(--font-display)",
                  fontWeight: 900,
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                }}
              >
                Posición {queuePosition ?? "—"} · Espera estimada{" "}
                {queueEtaSeconds != null
                  ? `~${queueEtaSeconds}s`
                  : "calculando"}
              </div>
            </div>

            <div style={{ display: "grid", gap: "0.55rem" }}>
              {queuePreviewForDisplay.length === 0 ? (
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
        )}

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

        <section
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: "0.8rem",
          }}
        >
          <StatPanel
            label="Winrate"
            value={
              user.wins + user.losses > 0
                ? `${Math.round((user.wins / (user.wins + user.losses)) * 100)}%`
                : "—"
            }
            sub={`${user.wins}W / ${user.losses}L`}
            tone="#4ade80"
          />
          <StatPanel
            label="MMR actual"
            value={user.mmr.toLocaleString()}
            sub="Rating global"
            tone="#38bdf8"
          />
          <StatPanel
            label="Partidas"
            value={(user.wins + user.losses).toString()}
            sub="Temporada actual"
            tone="#facc15"
          />
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
                    <div key={match.id} style={adminMatchStyle}>
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

function HeroMetric({
  label,
  value,
  tone,
}: {
  label: string;
  value: string | number;
  tone: string;
}) {
  return (
    <div
      style={{
        border: "1px solid rgba(232,244,255,0.08)",
        background: "rgba(2,6,14,0.58)",
        padding: "0.8rem 0.9rem",
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
          fontSize: "1.35rem",
          fontWeight: 900,
          lineHeight: 1.05,
          marginTop: "0.25rem",
        }}
      >
        {value}
      </div>
    </div>
  );
}

function QueueSignalCard({
  icon,
  label,
  value,
  sub,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
  tone: string;
}) {
  return (
    <div
      style={{
        border: "1px solid rgba(232,244,255,0.08)",
        background: "rgba(2,6,14,0.58)",
        padding: "0.85rem 0.95rem",
        display: "grid",
        gap: "0.35rem",
        minWidth: 0,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "0.75rem",
          color: "rgba(232,244,255,0.34)",
          fontSize: "0.64rem",
          textTransform: "uppercase",
          letterSpacing: "0.16em",
          fontWeight: 900,
        }}
      >
        <span>{label}</span>
        <span
          style={{ color: tone, display: "inline-grid", placeItems: "center" }}
        >
          {icon}
        </span>
      </div>
      <div
        style={{
          color: tone,
          fontFamily: "var(--font-display)",
          fontSize: "1.05rem",
          lineHeight: 1.05,
          fontWeight: 900,
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
          fontSize: "0.79rem",
          lineHeight: 1.45,
        }}
      >
        {sub}
      </div>
    </div>
  );
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

function StatPanel({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub: string;
  tone: string;
}) {
  return (
    <div style={panelStyle}>
      <div
        style={{
          color: "rgba(232,244,255,0.30)",
          fontSize: "0.68rem",
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
          fontSize: "2rem",
          lineHeight: 1,
          fontWeight: 900,
          marginTop: "0.35rem",
        }}
      >
        {value}
      </div>
      <div
        style={{
          color: "rgba(232,244,255,0.36)",
          fontSize: "0.8rem",
          marginTop: "0.25rem",
        }}
      >
        {sub}
      </div>
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
