import { useState, useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useAuthStore } from "../stores/auth.store";
import { useMatchmakingStore } from "../stores/matchmaking.store";
import { api } from "../lib/api";
import { getSocket } from "../lib/socket";
import { reportClientError } from "../lib/monitoring";
import { MatchFoundModal } from "../components/matchmaking/MatchFoundModal";
import { Plus, Search } from "lucide-react";
import { getRoleMeta } from "../lib/roles";

const LEVEL_COLORS: Record<number, string> = {
  1: "#6b7280", // Hierro       — gris apagado, sin glamour
  2: "#a16207", // Bronce       — marrón terroso
  3: "#94a3b8", // Plata        — gris plateado frío
  4: "#eab308", // Oro          — amarillo dorado saturado
  5: "#06b6d4", // Platino      — cian oscuro, premium
  6: "#3b82f6", // Diamante     — azul brillante, escaso
  7: "#8b5cf6", // Maestro      — violeta intenso
  8: "#d946ef", // Gran Maestro — magenta vibrante, raro
  9: "#f97316", // Apex         — naranja ardiente
  10: "#ff0000", // Challenger  — dorado resplandeciente, élite máxima
};

function parseLevel(user: { level?: number; rank: string }) {
  if (user.level && user.level >= 1 && user.level <= 10) return user.level;
  const rankLevel = Number(user.rank.replace("LVL_", ""));
  if (!Number.isNaN(rankLevel) && rankLevel >= 1 && rankLevel <= 10)
    return rankLevel;
  return 1;
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
  const [selectedRoles, setSelectedRoles] = useState<string[]>([]);
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

  useEffect(() => {
    if (status !== "searching" || !searchStartedAt) return;
    const iv = setInterval(
      () => setElapsed(Math.floor((Date.now() - searchStartedAt) / 1000)),
      1000,
    );
    return () => clearInterval(iv);
  }, [status, searchStartedAt]);

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
        if (!data.inQueue) return;
        if (data.mode) setSelectedMode(data.mode);
        if (data.roles) setSelectedRoles(data.roles);
        if (data.queueSize != null) setQueueSize(data.queueSize);
        setQueueProgress({ position: null, etaSeconds: null });
        startSearching(data.joinedAt);
      })
      .catch(() => {});
  }, [setQueueProgress, setQueueSize, startSearching]);

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
      stopSearching();
      return;
    }
    try {
      await api.post("/matchmaking/queue/join", {
        mode: selectedMode,
        roles: selectedRoles,
      });
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

  const isSearching = status === "searching";
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

  const level = parseLevel(user);
  const rankColor = LEVEL_COLORS[level] || "#00c8ff";

  const profileRoles = [user.mainRole, user.secondaryRole].filter(
    Boolean,
  ) as string[];
  const queuePhase = hasActiveMatch
    ? "MATCH ACTIVO"
    : isSearching
      ? "EN COLA"
      : "LISTO";

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
                  border: `1px solid ${rankColor}66`,
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
                    color: rankColor,
                    fontFamily: "var(--font-display)",
                    fontSize: "1.35rem",
                    fontWeight: 900,
                    letterSpacing: "0.08em",
                  }}
                >
                  {queuePhase}
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
                label="Cola"
                value={`${queueSize ?? 0}/10`}
                tone="#a78bfa"
              />
              <HeroMetric
                label="Posición"
                value={queuePosition ?? "—"}
                tone="#facc15"
              />
              <HeroMetric
                label="Espera"
                value={queueEtaSeconds != null ? `~${queueEtaSeconds}s` : "—"}
                tone="#4ade80"
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
                  Tu identidad antes de entrar a cola
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
                  <div
                    key="you"
                    style={{
                      ...slotBaseStyle,
                      position: "relative",
                      overflow: "hidden",
                      minHeight:
                        matchmakingLayout === "stack"
                          ? "290px"
                          : slotBaseStyle.minHeight,
                      borderColor: `${rankColor}66`,
                      background: `radial-gradient(circle at 50% 8%, ${rankColor}24, transparent 36%), linear-gradient(180deg, ${rankColor}12, rgba(2,6,14,0.74))`,
                    }}
                  >
                    <div
                      style={{
                        position: "absolute",
                        inset: "0 12%",
                        height: "1px",
                        top: 0,
                        background: `linear-gradient(90deg, transparent, ${rankColor}, transparent)`,
                        boxShadow: `0 0 18px ${rankColor}`,
                      }}
                    />
                    <div
                      style={{
                        position: "absolute",
                        inset: "auto 0 0",
                        height: "72px",
                        background:
                          "linear-gradient(0deg, rgba(0,0,0,0.42), transparent)",
                        pointerEvents: "none",
                      }}
                    />
                    <div
                      style={{
                        position: "relative",
                        color: rankColor,
                        fontSize: "0.62rem",
                        letterSpacing: "0.18em",
                        fontWeight: 900,
                        textTransform: "uppercase",
                      }}
                    >
                      Tú
                    </div>
                    <div
                      style={{
                        width: "64px",
                        height: "64px",
                        borderRadius: "999px",
                        overflow: "hidden",
                        display: "grid",
                        placeItems: "center",
                        border: `1px solid ${rankColor}`,
                        color: rankColor,
                        fontFamily: "var(--font-display)",
                        fontWeight: 900,
                        fontSize: "1.25rem",
                        background: "rgba(0,0,0,0.25)",
                        boxShadow: `0 0 28px ${rankColor}33`,
                      }}
                    >
                      {user.avatar && !avatarLoadError ? (
                        <img
                          src={user.avatar}
                          alt={user.username}
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
                    <div style={{ minWidth: 0, textAlign: "center" }}>
                      <div
                        style={{
                          color: "#fff",
                          fontFamily: "var(--font-display)",
                          fontWeight: 900,
                          fontSize: "1rem",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {user.username}
                      </div>
                    </div>
                    <PlayerRankPlate
                      level={level}
                      mmr={user.mmr}
                      color={rankColor}
                    />
                    <div
                      style={{
                        display: "flex",
                        gap: "0.35rem",
                        flexWrap: "wrap",
                        justifyContent: "center",
                      }}
                    >
                      {profileRoles.length > 0 ? (
                        profileRoles.map((role) => (
                          <RolePill key={role} role={role} />
                        ))
                      ) : (
                        <RolePill role="Sin rol" muted />
                      )}
                    </div>
                  </div>
                ) : (
                  <div
                    key={idx}
                    style={{
                      ...slotBaseStyle,
                      minHeight:
                        matchmakingLayout === "stack"
                          ? "290px"
                          : slotBaseStyle.minHeight,
                    }}
                  >
                    <div
                      style={{
                        width: "42px",
                        height: "42px",
                        border: "1px dashed rgba(232,244,255,0.13)",
                        display: "grid",
                        placeItems: "center",
                        color: "rgba(232,244,255,0.22)",
                      }}
                    >
                      <Plus size={18} />
                    </div>
                    <div
                      style={{
                        color: "rgba(232,244,255,0.26)",
                        fontFamily: "var(--font-display)",
                        fontWeight: 900,
                        fontSize: "0.7rem",
                        letterSpacing: "0.12em",
                        textTransform: "uppercase",
                      }}
                    >
                      Slot aliado
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
                Entrás solo o con party chica. El sistema completa jugadores,
                arma equipos y abre una sala con capitanes y veto de mapas.
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
                  Buscando {formatElapsed(elapsed)} · Cancelar
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
                          #{index + 1} preview · {entry.mmr} MMR ·{" "}
                          {entry.isBot ? "bot testing" : "usuario real"}
                        </div>
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

function RolePill({ role, muted }: { role: string; muted?: boolean }) {
  const meta = getRoleMeta(role);
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
        padding: "0.28rem 0.45rem",
        fontFamily: "var(--font-display)",
        fontSize: "0.62rem",
        fontWeight: 900,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
      }}
    >
      {meta && (
        <img
          src={meta.icon}
          alt=""
          style={{
            width: "15px",
            height: "15px",
            objectFit: "contain",
            filter: `drop-shadow(0 0 5px ${color}66)`,
          }}
        />
      )}
      {meta?.label ?? role}
    </span>
  );
}

function PlayerRankPlate({
  level,
  mmr,
  color,
}: {
  level: number;
  mmr: number;
  color: string;
}) {
  return (
    <div style={rankPlateStyle(color)}>
      <svg
        aria-hidden="true"
        viewBox="0 0 190 62"
        preserveAspectRatio="none"
        style={rankPlateBorderSvgStyle}
      >
        <polygon
          points="15,1 189,1 189,47 173,61 1,61 1,15"
          fill="none"
          stroke={color}
          strokeOpacity="0.72"
          strokeWidth="1.4"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <div style={rankPlateTopLineStyle(color)} />
      <div style={rankPlateChevronStyle("left", color)} />
      <div style={rankPlateChevronStyle("right", color)} />

      <div style={rankSealStyle(color)}>
        <svg width="42" height="42" viewBox="0 0 42 42" aria-hidden="true">
          <defs>
            <linearGradient
              id={`rank-seal-${level}`}
              x1="0"
              y1="0"
              x2="1"
              y2="1"
            >
              <stop offset="0%" stopColor={color} stopOpacity="0.95" />
              <stop offset="100%" stopColor="#020617" stopOpacity="0.35" />
            </linearGradient>
          </defs>
          <path
            d="M21 3.5 35.7 9.8v12.7C35.7 31.2 29.2 37 21 39 12.8 37 6.3 31.2 6.3 22.5V9.8L21 3.5Z"
            fill={`url(#rank-seal-${level})`}
            stroke={color}
            strokeWidth="1.4"
          />
        </svg>
        <span style={rankSealNumberStyle}>{level}</span>
      </div>

      <div style={{ minWidth: 0, position: "relative", zIndex: 1 }}>
        <div style={rankPlateLabelStyle}>Nexus Rating</div>
        <div style={rankPlateMmrStyle(color)}>
          {mmr.toLocaleString("es-AR")}
        </div>
        <div style={rankPlateUnitStyle}>ELO</div>
      </div>
    </div>
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
  border: "1px dashed rgba(232,244,255,0.10)",
  background: "rgba(255,255,255,0.025)",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: "0.7rem",
  padding: "1rem",
};

function rankPlateStyle(color: string): React.CSSProperties {
  return {
    position: "relative",
    width: "min(100%, 190px)",
    minHeight: "62px",
    display: "grid",
    gridTemplateColumns: "52px minmax(0, 1fr)",
    alignItems: "center",
    gap: "0.55rem",
    padding: "0.55rem 0.82rem",
    background: `linear-gradient(135deg, rgba(2,6,14,0.96), ${color}14 52%, rgba(2,6,14,0.86))`,
    boxShadow: `0 0 30px ${color}18, inset 0 0 24px rgba(255,255,255,0.025)`,
    clipPath: "polygon(8% 0, 100% 0, 100% 76%, 91% 100%, 0 100%, 0 24%)",
  };
}

const rankPlateBorderSvgStyle: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  width: "100%",
  height: "100%",
  pointerEvents: "none",
  overflow: "visible",
  filter: "drop-shadow(0 0 7px currentColor)",
};

function rankPlateTopLineStyle(color: string): React.CSSProperties {
  return {
    position: "absolute",
    top: 0,
    left: "18%",
    right: "10%",
    height: "2px",
    background: `linear-gradient(90deg, transparent, ${color}, transparent)`,
    boxShadow: `0 0 14px ${color}`,
  };
}

function rankPlateChevronStyle(
  side: "left" | "right",
  color: string,
): React.CSSProperties {
  return {
    position: "absolute",
    top: "50%",
    [side]: "0.42rem",
    width: "18px",
    height: "28px",
    borderTop: `1px solid ${color}44`,
    borderBottom: `1px solid ${color}44`,
    transform: `translateY(-50%) skewX(${side === "left" ? "-24deg" : "24deg"})`,
    opacity: 0.75,
  };
}

function rankSealStyle(color: string): React.CSSProperties {
  return {
    position: "relative",
    width: "46px",
    height: "46px",
    display: "grid",
    placeItems: "center",
    filter: `drop-shadow(0 0 10px ${color}66)`,
  };
}

const rankSealNumberStyle: React.CSSProperties = {
  position: "absolute",
  color: "#fff",
  fontFamily: "var(--font-display)",
  fontSize: "1rem",
  fontWeight: 900,
  lineHeight: 1,
  textShadow: "0 1px 8px rgba(0,0,0,0.75)",
};

const rankPlateLabelStyle: React.CSSProperties = {
  color: "rgba(232,244,255,0.42)",
  fontSize: "0.56rem",
  fontWeight: 900,
  letterSpacing: "0.16em",
  textTransform: "uppercase",
};

function rankPlateMmrStyle(color: string): React.CSSProperties {
  return {
    marginTop: "0.1rem",
    display: "flex",
    alignItems: "baseline",
    gap: "0.32rem",
    color,
    fontFamily: "var(--font-display)",
    fontSize: "clamp(1rem, 1.25vw, 1.25rem)",
    fontWeight: 900,
    lineHeight: 0.95,
    letterSpacing: "0",
    textShadow: `0 0 16px ${color}55`,
  };
}

const rankPlateUnitStyle: React.CSSProperties = {
  color: "rgba(232,244,255,0.52)",
  fontSize: "0.55rem",
  fontWeight: 900,
  letterSpacing: "0.18em",
  marginTop: "0.18rem",
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
