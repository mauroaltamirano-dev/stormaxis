import { useState, useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useAuthStore } from "../stores/auth.store";
import { useMatchmakingStore } from "../stores/matchmaking.store";
import { api } from "../lib/api";
import { getSocket } from "../lib/socket";
import { reportClientError } from "../lib/monitoring";
import { MatchFoundModal } from "../components/matchmaking/MatchFoundModal";
import { Plus, Search, Swords, Shield, Zap, Heart, Users } from "lucide-react";

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

const ROLES = [
  { key: "TANK", label: "Tank", Icon: Shield },
  { key: "DPS", label: "DPS", Icon: Swords },
  { key: "BRUISER", label: "Bruiser", Icon: Zap },
  { key: "SUPPORT", label: "Support", Icon: Users },
  { key: "HEALER", label: "Healer", Icon: Heart },
];

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
      (payload: { position?: number; etaSeconds?: number; queueSize?: number }) => {
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
          const position = data.players.findIndex((entry) => entry.userId === user.id);
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

  function toggleRole(role: string) {
    setSelectedRoles((prev) =>
      prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role],
    );
  }

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
  const queueControlsLocked = isSearching || hasActiveMatch;
  const findMatchDisabled = hasActiveMatch;
  const queuePreviewForDisplay = queuePreview;
  const displayQueueCount = queuePreview.length;

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

  return (
    <>
      {pendingMatch && <MatchFoundModal match={pendingMatch} />}

      {/* ─── PARTY SLOTS (FACEIT style) ─── */}
      <section
        style={{
          position: "relative",
          width: "100%",
          padding: "2rem 0 0",
          marginBottom: "2rem",
          overflow: "hidden",
        }}
      >
        {/* Faint background glow behind center card */}
        <div
          style={{
            position: "absolute",
            left: "50%",
            top: "50%",
            transform: "translate(-50%, -50%)",
            width: "300px",
            height: "200px",
            background: `radial-gradient(ellipse, ${rankColor}20, transparent 70%)`,
            pointerEvents: "none",
          }}
        />

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(5, 1fr)",
            gap: "0.75rem",
            alignItems: "stretch",
          }}
        >
          {SLOT_ORDER.map((idx) => {
            const isCenter = idx === 2;

            if (isCenter) {
              // ─── USER CARD ───
              return (
                <div
                  key="user"
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "stretch",
                    position: "relative",
                    zIndex: 2,
                  }}
                >
                  {/* "You" label above */}
                  <div
                    style={{
                      textAlign: "center",
                      fontFamily: "var(--font-display)",
                      fontSize: "0.6rem",
                      fontWeight: 700,
                      letterSpacing: "0.2em",
                      textTransform: "uppercase",
                      color: rankColor,
                      marginBottom: "0.5rem",
                      opacity: 0.8,
                    }}
                  >
                    ★ Tú ★
                  </div>

                  <div
                    style={{
                      border: `1px solid ${rankColor}66`,
                      background: `linear-gradient(160deg, #0d1422 60%, ${rankColor}0d)`,
                      position: "relative",
                      overflow: "hidden",
                      flex: 1,
                    }}
                  >
                    {/* Top accent */}
                    <div
                      style={{
                        position: "absolute",
                        top: 0,
                        left: 0,
                        right: 0,
                        height: "2px",
                        background: `linear-gradient(90deg, transparent, ${rankColor}, transparent)`,
                      }}
                    />

                    {/* Avatar area */}
                    <div
                      style={{
                        padding: "1.5rem 1rem 1rem",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        gap: "0.75rem",
                      }}
                    >
                      {/* Avatar hex */}
                      <div style={{ position: "relative" }}>
                        <div
                          style={{
                            width: "72px",
                            height: "72px",
                            clipPath:
                              "polygon(50% 0%, 95% 25%, 95% 75%, 50% 100%, 5% 75%, 5% 25%)",
                            background: `linear-gradient(135deg, #1a3a5c, #0d2040)`,
                            border: `2px solid ${rankColor}`,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontFamily: "var(--font-display)",
                            fontSize: "1.5rem",
                            fontWeight: 900,
                            color: rankColor,
                            overflow: "hidden",
                            position: "relative",
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
                                display: "block",
                              }}
                            />
                          ) : (
                            user.username.slice(0, 2).toUpperCase()
                          )}
                        </div>
                        {/* Online dot */}
                        <div
                          style={{
                            position: "absolute",
                            bottom: "4px",
                            right: "4px",
                            width: "10px",
                            height: "10px",
                            background: "#00e676",
                            border: "2px solid #0d1422",
                            borderRadius: "50%",
                          }}
                        />
                      </div>

                      {/* Username & Level */}
                      <div style={{ textAlign: "center", width: "100%" }}>
                        <div
                          style={{
                            fontFamily: "var(--font-display)",
                            fontSize: "0.95rem",
                            fontWeight: 700,
                            color: "#fff",
                            letterSpacing: "0.05em",
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                        >
                          {user.username}
                        </div>
                      </div>

                      {/* Level hex badge */}
                      <div
                        title={`Nivel ${level}`}
                        style={{
                          position: "relative",
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          width: "44px",
                          height: "44px",
                          flexShrink: 0,
                        }}
                      >
                        <svg
                          width="44"
                          height="44"
                          viewBox="0 0 44 44"
                          style={{ position: "absolute", inset: 0 }}
                        >
                          <polygon
                            points="22,3 39,12.5 39,31.5 22,41 5,31.5 5,12.5"
                            fill={`${rankColor}18`}
                            stroke={rankColor}
                            strokeWidth="1.5"
                          />
                        </svg>
                        <span
                          style={{
                            position: "relative",
                            fontFamily: "var(--font-display)",
                            fontSize: level >= 10 ? "0.85rem" : "1rem",
                            fontWeight: 900,
                            color: rankColor,
                            letterSpacing: "-0.02em",
                            lineHeight: 1,
                            textShadow: `0 0 10px ${rankColor}80`,
                          }}
                        >
                          {level}
                        </span>
                      </div>

                      {/* MMR number */}
                      <div
                        style={{
                          textAlign: "center",
                          borderTop: "1px solid rgba(255,255,255,0.06)",
                          width: "100%",
                          paddingTop: "0.875rem",
                        }}
                      >
                        <div
                          style={{
                            fontFamily: "var(--font-display)",
                            fontSize: "1.6rem",
                            fontWeight: 900,
                            color: "#fff",
                            lineHeight: 1,
                          }}
                        >
                          {user.mmr.toLocaleString()}
                        </div>
                        <div
                          style={{
                            fontSize: "0.6rem",
                            textTransform: "uppercase",
                            letterSpacing: "0.2em",
                            color: "#64748b",
                            marginTop: "0.25rem",
                            fontWeight: 700,
                          }}
                        >
                          MMR
                        </div>
                      </div>

                      {/* W/L */}
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "1fr 1fr",
                          gap: "0.5rem",
                          width: "100%",
                          paddingBottom: "1rem",
                        }}
                      >
                        <div
                          style={{
                            textAlign: "center",
                            background: "rgba(0,230,118,0.06)",
                            border: "1px solid rgba(0,230,118,0.15)",
                            padding: "0.5rem 0.25rem",
                          }}
                        >
                          <div
                            style={{
                              fontFamily: "var(--font-display)",
                              fontSize: "1rem",
                              fontWeight: 700,
                              color: "#00e676",
                            }}
                          >
                            {user.wins}
                          </div>
                          <div
                            style={{
                              fontSize: "0.6rem",
                              textTransform: "uppercase",
                              letterSpacing: "0.15em",
                              color: "#64748b",
                              fontWeight: 700,
                            }}
                          >
                            Wins
                          </div>
                        </div>
                        <div
                          style={{
                            textAlign: "center",
                            background: "rgba(255,71,87,0.06)",
                            border: "1px solid rgba(255,71,87,0.15)",
                            padding: "0.5rem 0.25rem",
                          }}
                        >
                          <div
                            style={{
                              fontFamily: "var(--font-display)",
                              fontSize: "1rem",
                              fontWeight: 700,
                              color: "#ff4757",
                            }}
                          >
                            {user.losses}
                          </div>
                          <div
                            style={{
                              fontSize: "0.6rem",
                              textTransform: "uppercase",
                              letterSpacing: "0.15em",
                              color: "#64748b",
                              fontWeight: 700,
                            }}
                          >
                            Losses
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            }

            // ─── EMPTY SLOT ───
            return (
              <div
                key={idx}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "stretch",
                }}
              >
                {/* Spacer to align with "Tú" label */}
                <div style={{ height: "1.5rem", marginBottom: "0.5rem" }} />

                <button
                  style={{
                    flex: 1,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "0.75rem",
                    border: "1px dashed rgba(255,255,255,0.1)",
                    background: "rgba(255,255,255,0.02)",
                    cursor: "pointer",
                    padding: "2rem 1rem",
                    transition: "all 0.2s",
                    minHeight: "200px",
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.background =
                      "rgba(0,200,255,0.04)";
                    (e.currentTarget as HTMLButtonElement).style.borderColor =
                      "rgba(0,200,255,0.25)";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.background =
                      "rgba(255,255,255,0.02)";
                    (e.currentTarget as HTMLButtonElement).style.borderColor =
                      "rgba(255,255,255,0.1)";
                  }}
                >
                  <div
                    style={{
                      width: "40px",
                      height: "40px",
                      border: "1px dashed rgba(255,255,255,0.15)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "rgba(255,255,255,0.2)",
                    }}
                  >
                    <Plus size={20} />
                  </div>
                  <span
                    style={{
                      fontFamily: "var(--font-display)",
                      fontSize: "0.65rem",
                      fontWeight: 700,
                      textTransform: "uppercase",
                      letterSpacing: "0.15em",
                      color: "#334155",
                    }}
                  >
                    Invitar
                  </span>
                </button>
              </div>
            );
          })}
        </div>
      </section>

      {/* ─── MODE + ROLE + FIND MATCH ─── */}
      <section style={{ marginBottom: "2rem" }}>
        {/* Mode tabs */}
        <div
          style={{
            display: "flex",
            gap: "0",
            borderBottom: "1px solid rgba(255,255,255,0.06)",
            marginBottom: "1.25rem",
            justifyContent: "center",
          }}
        >
          {MODES.map((mode) => (
            <button
              key={mode.key}
              onClick={() => !queueControlsLocked && setSelectedMode(mode.key)}
              style={{
                padding: "0.6rem 1.25rem",
                fontFamily: "var(--font-display)",
                fontSize: "1rem",
                fontWeight: 700,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                color: selectedMode === mode.key ? "#00c8ff" : "#475569",
                background: "none",
                border: "none",
                borderBottom: `2px solid ${selectedMode === mode.key ? "#00c8ff" : "transparent"}`,
                marginBottom: "-1px",
                cursor: queueControlsLocked ? "default" : "pointer",
                transition: "all 0.15s",
              }}
            >
              {mode.label}
              <span
                style={{
                  display: "block",
                  fontSize: "0.7rem",
                  fontWeight: 400,
                  color: "#cfcfcf",
                  letterSpacing: "0.05em",
                  textTransform: "none",
                  marginTop: "1px",
                }}
              >
                {mode.desc}
              </span>
            </button>
          ))}
        </div>

        {/* Role selector */}
        <div
          style={{ display: "flex", gap: "0.5rem", marginBottom: "1.25rem" }}
        >
          <span
            style={{
              fontFamily: "var(--font-display)",
              fontSize: "1rem",
              fontWeight: 800,
              textTransform: "uppercase",
              letterSpacing: "0.15em",
              color: "#d4d4d4",
              alignSelf: "center",
              marginRight: "0.25rem",
              whiteSpace: "nowrap",
            }}
          >
            Rol:
          </span>
          {ROLES.map(({ key, label, Icon }) => {
            const active = selectedRoles.includes(key);
            return (
              <button
                key={key}
                onClick={() => !queueControlsLocked && toggleRole(key)}
                style={{
                  flex: 1,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: "0.3rem",
                  padding: "0.625rem 0.25rem",
                  background: active
                    ? "rgba(124,77,255,0.12)"
                    : "rgba(255,255,255,0.03)",
                  border: `1px solid ${active ? "#7c4dff66" : "rgba(255,255,255,0.06)"}`,
                  cursor: queueControlsLocked ? "default" : "pointer",
                  transition: "all 0.15s",
                  color: active ? "#7c4dff" : "#475569",
                }}
              >
                <Icon size={16} />
                <span
                  style={{
                    fontFamily: "var(--font-display)",
                    fontSize: "0.6rem",
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                  }}
                >
                  {label}
                </span>
              </button>
            );
          })}
        </div>

        {/* Find match button */}
        <button
          onClick={handleFindMatch}
          disabled={findMatchDisabled}
          style={{
            width: "100%",
            padding: "1rem",
            fontFamily: "var(--font-display)",
            fontSize: "1rem",
            fontWeight: 900,
            letterSpacing: "0.2em",
            textTransform: "uppercase",
            background: findMatchDisabled
              ? "rgba(148,163,184,0.25)"
              : isSearching
                ? "transparent"
                : "#00c8ff",
            color: findMatchDisabled ? "#cbd5e1" : isSearching ? "#00c8ff" : "#000",
            border: findMatchDisabled
              ? "1px solid rgba(148,163,184,0.35)"
              : isSearching
                ? "1px solid #00c8ff"
                : "none",
            cursor: findMatchDisabled ? "not-allowed" : "pointer",
            transition: "all 0.2s",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "0.75rem",
            opacity: findMatchDisabled ? 0.9 : 1,
          }}
        >
          {findMatchDisabled ? (
            <>Partida activa en curso</>
          ) : isSearching ? (
            <>
              <div
                style={{
                  width: "10px",
                  height: "10px",
                  background: "#00c8ff",
                  animation: "blink 1s infinite",
                }}
              />
              Buscando... {formatElapsed(elapsed)}
              <span style={{ fontSize: "0.7rem", fontWeight: 400, opacity: 1 }}>
                — Cancelar
              </span>
            </>
          ) : (
            <>
              <Search size={18} />
              Buscar Partida
            </>
          )}
        </button>
        {hasActiveMatch && (
          <div
            style={{
              marginTop: "0.7rem",
              color: "#94a3b8",
              fontSize: "0.82rem",
              textAlign: "center",
            }}
          >
            No podés buscar otra partida hasta cerrar la actual.
          </div>
        )}

        {isSearching && (
          <div
            style={{
              marginTop: "0.9rem",
              border: "1px solid rgba(0,200,255,0.16)",
              background: "rgba(0,200,255,0.05)",
              padding: "0.85rem 1rem",
              display: "grid",
              gap: "0.75rem",
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
                <div
                  style={{
                    fontSize: "0.62rem",
                    color: "#7dd3fc",
                    textTransform: "uppercase",
                    letterSpacing: "0.18em",
                    fontWeight: 800,
                  }}
                >
                  Cola de test
                </div>
                <div style={{ color: "#e2e8f0", fontWeight: 700 }}>
                  {queueSize} real{queueSize === 1 ? "" : "es"} buscando ·{" "}
                  {displayQueueCount}/10 visibles
                </div>
              </div>
              <div
                style={{
                  color: "#94a3b8",
                  fontSize: "0.82rem",
                  fontWeight: 700,
                }}
              >
                Llenado con bots disponible desde panel admin
              </div>
            </div>

            <div style={{ color: "#94a3b8", fontSize: "0.82rem" }}>
              Se actualiza cada 3s. Los bots de testing ahora son reales de
              backend (solo para esta fase).
            </div>
            {isSearching && (
              <div style={{ color: "#7dd3fc", fontSize: "0.8rem", fontWeight: 700 }}>
                Posición {queuePosition ?? "—"} en cola · ETA{" "}
                {queueEtaSeconds != null ? `~${queueEtaSeconds}s` : "calculando..."}
              </div>
            )}

            <div style={{ display: "grid", gap: "0.45rem" }}>
              {queuePreviewForDisplay.length === 0 ? (
                <div style={{ color: "#94a3b8", fontSize: "0.9rem" }}>
                  Todavía no hay nadie visible en cola.
                </div>
              ) : (
                queuePreviewForDisplay.map((entry, index) => (
                  <div
                    key={entry.userId}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      gap: "0.75rem",
                      border: "1px solid rgba(255,255,255,0.06)",
                      background: "rgba(15,23,42,0.65)",
                      padding: "0.65rem 0.8rem",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "0.7rem",
                      }}
                    >
                      <div
                        style={{
                          width: "30px",
                          height: "30px",
                          borderRadius: "50%",
                          border: "1px solid rgba(0,200,255,0.25)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          color: "#7dd3fc",
                          fontFamily: "var(--font-display)",
                          fontWeight: 800,
                          fontSize: "0.72rem",
                          background: "rgba(0,200,255,0.08)",
                        }}
                      >
                        {entry.username.slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <div style={{ color: "#fff", fontWeight: 700 }}>
                          {entry.username}{" "}
                          {entry.userId === user.id ? "(vos)" : ""}
                        </div>
                        <div style={{ color: "#64748b", fontSize: "0.78rem" }}>
                          #{index + 1} en la preview · MMR {entry.mmr}
                          {entry.isBot ? " · bot testing" : " · usuario real"}
                        </div>
                      </div>
                    </div>

                    <div
                      style={{
                        color: "#94a3b8",
                        fontSize: "0.78rem",
                        textAlign: "right",
                      }}
                    >
                      {entry.isBot
                        ? "Bot del sistema"
                        : entry.joinedAt
                          ? `Esperando ${Math.max(0, Math.floor((Date.now() - entry.joinedAt) / 1000))}s`
                          : "Esperando…"}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {hiddenActiveMatchId && (
          <div
            style={{
              marginTop: "0.9rem",
              border: "1px solid rgba(251,191,36,0.22)",
              background: "rgba(251,191,36,0.08)",
              padding: "0.85rem 1rem",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "1rem",
            }}
          >
            <div>
              <div
                style={{
                  color: "#fde68a",
                  fontWeight: 800,
                  fontSize: "0.82rem",
                  textTransform: "uppercase",
                  letterSpacing: "0.14em",
                }}
              >
                Match activo oculto
              </div>
              <div style={{ color: "#e2e8f0", fontSize: "0.92rem" }}>
                Saliste del matchroom, pero la partida sigue viva. Podés volver
                cuando quieras.
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
              style={{
                border: "none",
                background: "#fbbf24",
                color: "#111827",
                padding: "0.75rem 1rem",
                fontWeight: 800,
                cursor: "pointer",
              }}
            >
              Reabrir match
            </button>
          </div>
        )}
      </section>

      {/* ─── STATS ROW ─── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3,1fr)",
          gap: "0.625rem",
          marginBottom: "1.75rem",
        }}
      >
        {[
          {
            label: "Winrate",
            value:
              user && user.wins + user.losses > 0
                ? `${Math.round((user.wins / (user.wins + user.losses)) * 100)}%`
                : "—",
            color: "#00e676",
            sub: `${user?.wins ?? 0}W / ${user?.losses ?? 0}L`,
          },
          {
            label: "MMR actual",
            value: user?.mmr.toLocaleString() ?? "—",
            color: "#00c8ff",
            sub: "Rating global",
          },
          {
            label: "Partidas",
            value: ((user?.wins ?? 0) + (user?.losses ?? 0)).toString(),
            color: "#f0a500",
            sub: "Esta temporada",
          },
        ].map((stat) => (
          <div
            key={stat.label}
            style={{
              border: "1px solid rgba(255,255,255,0.06)",
              background: "rgba(255,255,255,0.02)",
              padding: "0.875rem 1rem",
            }}
          >
            <div
              style={{
                fontSize: "0.6rem",
                color: "#475569",
                textTransform: "uppercase",
                letterSpacing: "0.15em",
                marginBottom: "0.375rem",
                fontWeight: 700,
              }}
            >
              {stat.label}
            </div>
            <div
              style={{
                fontFamily: "var(--font-display)",
                fontSize: "1.5rem",
                fontWeight: 700,
                color: stat.color,
                lineHeight: 1,
              }}
            >
              {stat.value}
            </div>
            <div
              style={{
                fontSize: "0.65rem",
                color: "#334155",
                marginTop: "0.2rem",
              }}
            >
              {stat.sub}
            </div>
          </div>
        ))}
      </div>

      {user.role === "ADMIN" && (
        <section
          style={{
            border: "1px solid rgba(248,113,113,0.18)",
            background: "rgba(127,29,29,0.08)",
            padding: "1rem",
            display: "grid",
            gap: "0.9rem",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: "1rem",
              alignItems: "center",
            }}
          >
            <div>
              <div
                style={{
                  fontSize: "0.7rem",
                  color: "#fca5a5",
                  textTransform: "uppercase",
                  letterSpacing: "0.18em",
                  fontWeight: 800,
                }}
              >
                Admin · Rescue panel
              </div>
              <div style={{ color: "#fff", fontWeight: 700 }}>
                Cancelá o borrá matches trabados para destrabar el MVP.
              </div>
            </div>
            <div style={{ color: "#94a3b8", fontSize: "0.82rem" }}>
              {adminLoading
                ? "Actualizando…"
                : `${adminMatches.length} activo(s)`}
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button
              onClick={handleAdminFillBots}
              disabled={adminFillingBots}
              style={{
                border: "1px solid rgba(125,211,252,0.4)",
                background: "rgba(14,116,144,0.25)",
                color: "#bae6fd",
                padding: "0.6rem 0.9rem",
                fontWeight: 800,
                cursor: adminFillingBots ? "not-allowed" : "pointer",
              }}
            >
              {adminFillingBots
                ? "Completando…"
                : "Completar cola a 10 con bots"}
            </button>
          </div>

          {adminError && (
            <div
              style={{
                border: "1px solid rgba(248,113,113,0.26)",
                background: "rgba(248,113,113,0.08)",
                color: "#fecaca",
                padding: "0.8rem 0.9rem",
              }}
            >
              {adminError}
            </div>
          )}

          {adminMatches.length === 0 ? (
            <div style={{ color: "#94a3b8", fontSize: "0.92rem" }}>
              No hay matches activos o colgados ahora mismo.
            </div>
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
                      border: "1px solid rgba(255,255,255,0.08)",
                      background: "rgba(15,23,42,0.72)",
                      padding: "0.9rem",
                      display: "grid",
                      gap: "0.65rem",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: "1rem",
                        alignItems: "center",
                      }}
                    >
                      <div>
                        <div style={{ color: "#fff", fontWeight: 800 }}>
                          {match.status} · {match.id.slice(0, 8)}
                        </div>
                        <div style={{ color: "#94a3b8", fontSize: "0.82rem" }}>
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
                          color: "#cbd5e1",
                          fontSize: "0.82rem",
                          textAlign: "right",
                        }}
                      >
                        {match.status === "ACCEPTING"
                          ? `Aceptaron ${accepted}/${humanPlayers.length} humanos`
                          : match.selectedMap
                            ? `Mapa: ${match.selectedMap}`
                            : "Sin mapa todavía"}
                      </div>
                    </div>

                    <div
                      style={{
                        display: "flex",
                        gap: "0.6rem",
                        justifyContent: "flex-end",
                      }}
                    >
                      <button
                        onClick={() => handleAdminCancelMatch(match.id)}
                        disabled={adminActionMatchId === match.id}
                        style={{
                          border: "1px solid rgba(251,191,36,0.35)",
                          background: "rgba(251,191,36,0.10)",
                          color: "#fde68a",
                          padding: "0.65rem 0.9rem",
                          fontWeight: 800,
                          cursor:
                            adminActionMatchId === match.id
                              ? "not-allowed"
                              : "pointer",
                        }}
                      >
                        Cancelar
                      </button>
                      <button
                        onClick={() => handleAdminDeleteMatch(match.id)}
                        disabled={adminActionMatchId === match.id}
                        style={{
                          border: "1px solid rgba(248,113,113,0.35)",
                          background: "rgba(248,113,113,0.10)",
                          color: "#fecaca",
                          padding: "0.65rem 0.9rem",
                          fontWeight: 800,
                          cursor:
                            adminActionMatchId === match.id
                              ? "not-allowed"
                              : "pointer",
                        }}
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
    </>
  );
}
