import type { CSSProperties, FormEvent, ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { HOTS_MAPS, MAP_ID_BY_NAME, MAP_NAME_BY_ID } from "@nexusgg/shared";

type MatchStatus =
  | "ACCEPTING"
  | "VETOING"
  | "PLAYING"
  | "VOTING"
  | "COMPLETED"
  | "CANCELLED"
  | "PENDING";

type Player = {
  userId: string | null;
  team: 1 | 2;
  isCaptain: boolean;
  isBot?: boolean;
  botName?: string | null;
  mmrBefore: number;
  mmrDelta?: number | null;
  user: {
    id: string;
    username: string;
    avatar: string | null;
    rank: string;
    mmr: number;
    wins?: number;
    losses?: number;
    winrate?: number;
    recentMatches?: Array<{ won: boolean; map: string | null; date: string }>;
  };
};

type MatchState = {
  id: string;
  status: MatchStatus;
  selectedMap?: string | null;
  winner?: 1 | 2 | null;
  duration?: number | null;
  players: Player[];
  vetoes: Array<{
    mapId: string;
    mapName: string;
    team: 1 | 2;
    auto: boolean;
    order: number;
  }>;
  votes?: Array<{ userId: string; winner: 1 | 2 }>;
  runtime?: {
    ready: { readyBy: string[]; totalPlayers: number } | null;
    voting: { expiresAt: number; totalPlayers: number } | null;
    finish: { captainIds: string[]; requestedBy: string[] } | null;
    veto: {
      remainingMaps: string[];
      currentTurn?: number;
      vetoIndex: number;
      vetoOrder: number[];
      timeoutAt?: number;
      captains: Record<number, string>;
    } | null;
    cancel: { captainIds: string[]; requestedBy: string[] } | null;
    voteCounts: { team1Votes: number; team2Votes: number; total: number };
  } | null;
};

type ChatMessage = {
  id: string;
  userId: string;
  username: string;
  avatar: string | null;
  content: string;
  timestamp: string;
};

type Props = {
  currentUserId: string;
  match: MatchState;
  chatMessages: ChatMessage[];
  onSendMessage: (content: string) => void;
  onBanMap: (mapId: string) => void;
  onReady: () => void;
  onFinishMatch: () => void;
  onVote: (winner: 1 | 2) => void;
  onCancelMatch: () => void;
  onBack: () => void;
};

const TEAM_COLORS = {
  1: {
    border: "rgba(0, 200, 255, 0.5)",
    accent: "#00c8ff",
    surface: "rgba(0, 200, 255, 0.08)",
  },
  2: {
    border: "rgba(255, 71, 87, 0.5)",
    accent: "#ff4757",
    surface: "rgba(255, 71, 87, 0.08)",
  },
} as const;

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
  10: "#fbbf24",
};

const MAP_BACKDROPS: Record<string, string> = {
  "Alterac Pass":
    "linear-gradient(135deg, rgba(131,189,255,0.35), rgba(15,23,42,0.95))",
  "Battlefield Eternity":
    "linear-gradient(135deg, rgba(255,208,102,0.35), rgba(36,25,60,0.95))",
  "Braxis Holdout":
    "linear-gradient(135deg, rgba(46,204,113,0.35), rgba(10,15,20,0.95))",
  "Cursed Hollow":
    "linear-gradient(135deg, rgba(149,117,205,0.35), rgba(16,18,37,0.95))",
  "Dragon Shire":
    "linear-gradient(135deg, rgba(244,114,182,0.30), rgba(40,18,18,0.95))",
  "Garden of Terror":
    "linear-gradient(135deg, rgba(34,197,94,0.35), rgba(16,24,21,0.95))",
  "Hanamura Temple":
    "linear-gradient(135deg, rgba(251,191,36,0.30), rgba(28,24,42,0.95))",
  "Infernal Shrines":
    "linear-gradient(135deg, rgba(251,146,60,0.35), rgba(35,12,14,0.95))",
  "Sky Temple":
    "linear-gradient(135deg, rgba(125,211,252,0.35), rgba(11,20,37,0.95))",
  "Tomb of the Spider Queen":
    "linear-gradient(135deg, rgba(168,85,247,0.35), rgba(22,15,35,0.95))",
  "Towers of Doom":
    "linear-gradient(135deg, rgba(248,113,113,0.35), rgba(28,12,20,0.95))",
  "Volskaya Foundry":
    "linear-gradient(135deg, rgba(59,130,246,0.35), rgba(12,20,38,0.95))",
};

// Map name → /maps/{id}.webp  (id viene directo de HOTS_MAPS, sin recomputar)
// Ejemplo: 'Tomb of the Spider Queen' → /maps/tomb-of-spider-queen.webp
function getMapImageUrl(mapName: string): string {
  const id = MAP_ID_BY_NAME[mapName]
  if (!id) return ""
  return `/maps/${id}.webp`
}

export function ActiveMatchRoom({
  currentUserId,
  match,
  chatMessages,
  onSendMessage,
  onBanMap,
  onReady,
  onFinishMatch,
  onVote,
  onCancelMatch,
  onBack,
}: Props) {
  const [now, setNow] = useState(Date.now());
  const [chatInput, setChatInput] = useState("");

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  const teams = useMemo(() => {
    const left = toDisplayTeam(
      match.players.filter((player) => player.team === 1),
      1,
    );
    const right = toDisplayTeam(
      match.players.filter((player) => player.team === 2),
      2,
    );
    return { left, right };
  }, [match.players]);

  const currentPlayer = match.players.find(
    (player) => player.userId === currentUserId,
  );
  const humanPlayersCount = match.players.filter(
    (player) => !player.isBot,
  ).length;
  const currentVote =
    match.votes?.find((vote) => vote.userId === currentUserId)?.winner ?? null;
  const readyBy = match.runtime?.ready?.readyBy ?? [];
  const isReady = readyBy.includes(currentUserId);
  const voteCounts = match.runtime?.voteCounts ?? {
    team1Votes: 0,
    team2Votes: 0,
    total: 0,
  };
  const votingExpiresAt = match.runtime?.voting?.expiresAt ?? null;
  const vetoState = match.runtime?.veto ?? null;
  const finishState = match.runtime?.finish ?? null;
  const finishApprovals = finishState?.requestedBy.length ?? 0;
  const finishNeeded = finishState?.captainIds.length ?? 2;
  const vetoTurn = getCurrentVetoTurn(match);
  const vetoSeconds = vetoState?.timeoutAt
    ? Math.max(0, Math.round((vetoState.timeoutAt - now) / 1000))
    : null;
  const votingSeconds = votingExpiresAt
    ? Math.max(0, Math.round((votingExpiresAt - now) / 1000))
    : null;
  const selectedMap = match.selectedMap ?? getSelectedMapFromVeto(match);
  const isCaptainTurn = Boolean(
    match.status === "VETOING" &&
    currentPlayer?.isCaptain &&
    currentPlayer.userId === vetoTurn?.captainId,
  );
  const cancelState = match.runtime?.cancel;
  const canRequestCancel =
    currentPlayer?.isCaptain &&
    ["VETOING", "PLAYING", "VOTING"].includes(match.status);
  const cancelRequestedByMe =
    cancelState?.requestedBy.includes(currentUserId) ?? false;
  const canSendChat = match.status !== "CANCELLED";
  const chatRemainingChars = 500 - chatInput.length;

  function handleSendChat(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSendChat) return;
    const nextMessage = chatInput.trim();
    if (!nextMessage) return;
    onSendMessage(nextMessage);
    setChatInput("");
  }

  return (
    <div style={pageShellStyle}>
      <div style={panelStyle}>
        <div style={headerStyle}>
          <div>
            <div style={eyebrowStyle}>Match room</div>
            <h2
              style={{
                margin: 0,
                fontFamily: "var(--font-display)",
                letterSpacing: "0.08em",
              }}
            >
              {match.status === "COMPLETED"
                ? "Partida cerrada"
                : match.status === "CANCELLED"
                  ? "Partida cancelada"
                  : `Estado: ${match.status}`}
            </h2>
          </div>
          <div style={{ display: "flex", gap: "0.75rem" }}>
            {canRequestCancel && (
              <button
                onClick={onCancelMatch}
                disabled={cancelRequestedByMe}
                style={dangerButtonStyle(cancelRequestedByMe)}
              >
                {cancelRequestedByMe
                  ? "Cancelación pedida"
                  : "Cancelar match (test)"}
              </button>
            )}
            <button onClick={onBack} style={ghostButtonStyle}>
              Volver
            </button>
          </div>
        </div>

        <MatchTimeline
          status={match.status}
          allConnected={
            readyBy.length ===
            (match.runtime?.ready?.totalPlayers ?? humanPlayersCount)
          }
        />

        {cancelState &&
          cancelState.requestedBy.length > 0 &&
          match.status !== "CANCELLED" && (
            <div style={infoBannerStyle}>
              {cancelState.requestedBy.length}/{cancelState.captainIds.length}{" "}
              capitanes pidieron cancelar la partida.
            </div>
          )}

        <div style={teamsGridStyle}>
          <TeamColumn team={teams.left} teamNumber={1} />
          <div style={{ display: "grid", gap: "1rem" }}>
            {match.status === "VETOING" && (
              <StageCard
                title="Veto de mapas"
                subtitle={
                  vetoTurn
                    ? `Turno del ${vetoTurn.team === 1 ? teams.left.name : teams.right.name}`
                    : "Esperando turno"
                }
              >
                <div
                  style={timerBadgeStyle(
                    vetoSeconds != null && vetoSeconds <= 10,
                  )}
                >
                  {vetoSeconds != null
                    ? `00:${String(vetoSeconds).padStart(2, "0")}`
                    : "—"}
                </div>
                <div style={mapGridStyle}>
                  {getRemainingMaps(match).map((mapName) => (
                    <MapVetoCard
                      key={mapName}
                      mapName={mapName}
                      active={isCaptainTurn}
                      onBan={() => onBanMap(getMapIdFromName(mapName))}
                    />
                  ))}
                </div>
                <small style={{ color: "#94a3b8" }}>
                  {isCaptainTurn
                    ? "Te toca vetar. Si expira el timer, el sistema banea un mapa al azar."
                    : "Solo el capitán del turno puede vetar."}
                </small>
              </StageCard>
            )}

            {match.status === "PLAYING" &&
              (() => {
                const totalPlayers =
                  match.runtime?.ready?.totalPlayers ?? humanPlayersCount;
                const connectedCount = readyBy.length;
                const allConnected = connectedCount === totalPlayers;
                const isCaptain = Boolean(currentPlayer?.isCaptain);
                const alreadyRequestedFinish = Boolean(
                  isCaptain && finishState?.requestedBy.includes(currentUserId),
                );

                return (
                  <StageCard
                    title={
                      allConnected ? "Todos conectados" : "Mapa confirmado"
                    }
                    subtitle={
                      allConnected
                        ? "La partida terminó. Cerrá el cliente y finalizá aquí."
                        : "Conectate a la lobby en Heroes of the Storm"
                    }
                  >
                    <MapSelectedCard mapName={selectedMap} />

                    {!allConnected && (
                      <button
                        onClick={onReady}
                        disabled={isReady}
                        style={primaryButtonStyle}
                      >
                        {isReady
                          ? "Esperando al resto…"
                          : "Conectarse a la partida"}
                      </button>
                    )}

                    <div style={{ color: "#94a3b8", fontSize: "0.9rem" }}>
                      Conectados: {connectedCount}/{totalPlayers}
                    </div>

                    {allConnected && (
                      <>
                        <button
                          onClick={onFinishMatch}
                          disabled={!isCaptain || alreadyRequestedFinish}
                          style={finishButtonStyle(
                            !isCaptain || alreadyRequestedFinish,
                          )}
                        >
                          ✓ Finalizar partida
                        </button>
                        <div style={{ color: "#94a3b8", fontSize: "0.86rem" }}>
                          Requiere confirmación de ambos capitanes:{" "}
                          {finishApprovals}/{finishNeeded}
                        </div>
                      </>
                    )}
                  </StageCard>
                );
              })()}

            {match.status === "VOTING" && (
              <StageCard
                title="Votación de ganador"
                subtitle="Votan todos los jugadores reales del test"
              >
                <div
                  style={{
                    display: "flex",
                    gap: "0.75rem",
                    justifyContent: "center",
                  }}
                >
                  <button
                    onClick={() => onVote(1)}
                    style={voteButtonStyle(1, currentVote === 1)}
                  >
                    Gana {teams.left.name}
                  </button>
                  <button
                    onClick={() => onVote(2)}
                    style={voteButtonStyle(2, currentVote === 2)}
                  >
                    Gana {teams.right.name}
                  </button>
                </div>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: "0.75rem",
                  }}
                >
                  <VotePill
                    label={teams.left.name}
                    votes={voteCounts.team1Votes}
                    color={TEAM_COLORS[1].accent}
                  />
                  <VotePill
                    label={teams.right.name}
                    votes={voteCounts.team2Votes}
                    color={TEAM_COLORS[2].accent}
                  />
                </div>
                <div
                  style={timerBadgeStyle(
                    votingSeconds != null && votingSeconds <= 20,
                  )}
                >
                  {votingSeconds != null
                    ? `${Math.floor(votingSeconds / 60)}:${String(votingSeconds % 60).padStart(2, "0")}`
                    : "—"}
                </div>
              </StageCard>
            )}

            {match.status === "COMPLETED" && (
              <StageCard
                title="Resultado final"
                subtitle={
                  match.duration
                    ? `Duración estimada ${formatDuration(match.duration)}`
                    : "Match finalizado"
                }
              >
                <div
                  style={winnerBannerStyle(
                    match.winner === 1
                      ? TEAM_COLORS[1].accent
                      : TEAM_COLORS[2].accent,
                  )}
                >
                  Ganó {match.winner === 1 ? teams.left.name : teams.right.name}
                </div>
                <ResultList match={match} />
              </StageCard>
            )}

            {match.status === "CANCELLED" && (
              <StageCard
                title="Match cancelado"
                subtitle="Cancelado por ambos capitanes para testing"
              >
                <div style={winnerBannerStyle("#fca5a5")}>
                  La partida fue cancelada
                </div>
                <small style={{ color: "#94a3b8" }}>
                  Volvé al dashboard y podés buscar otra partida.
                </small>
              </StageCard>
            )}

            <StageCard
              title="Chat del match"
              subtitle={
                canSendChat
                  ? "Coordinación en tiempo real entre jugadores"
                  : "Chat deshabilitado porque la partida está cancelada"
              }
            >
              <MatchChatPanel
                currentUserId={currentUserId}
                messages={chatMessages}
                draft={chatInput}
                remainingChars={chatRemainingChars}
                canSend={canSendChat}
                onDraftChange={setChatInput}
                onSubmit={handleSendChat}
              />
            </StageCard>
          </div>
          <TeamColumn team={teams.right} teamNumber={2} />
        </div>
      </div>
    </div>
  );
}

function MatchTimeline({
  status,
  allConnected,
}: {
  status: MatchStatus;
  allConnected: boolean;
}) {
  const steps: Array<{ key: string; label: string }> = [
    { key: "ACCEPTING", label: "Accept" },
    { key: "VETOING", label: "Veto" },
    { key: "PLAYING_CONNECT", label: "Conectar" },
    { key: "PLAYING_FINISH", label: "Finalizar" },
    { key: "VOTING", label: "Votar" },
    { key: "COMPLETED", label: "Resultado" },
  ];

  const order: Record<string, number> = {
    PENDING: 0,
    ACCEPTING: 1,
    VETOING: 2,
    PLAYING_CONNECT: 3,
    PLAYING_FINISH: 4,
    VOTING: 5,
    COMPLETED: 6,
    CANCELLED: 6,
  };

  // Map real status to virtual step key
  function resolveCurrentKey(): string {
    if (status === "PLAYING")
      return allConnected ? "PLAYING_FINISH" : "PLAYING_CONNECT";
    return status;
  }

  const currentKey = resolveCurrentKey();
  const currentLevel = order[currentKey] ?? 0;

  return (
    <div
      style={{
        ...timelineWrapStyle,
        gridTemplateColumns: `repeat(${steps.length}, 1fr)`,
      }}
    >
      {steps.map((step, index) => {
        const stepLevel = order[step.key] ?? 0;
        const isDone = currentLevel > stepLevel;
        const isCurrent =
          currentKey === step.key ||
          (status === "CANCELLED" && step.key === "COMPLETED");
        const isCancelled = status === "CANCELLED" && step.key === "COMPLETED";

        return (
          <div key={step.key} style={timelineStepStyle}>
            <div style={timelineNodeRowStyle}>
              <div style={timelineNodeStyle(isDone, isCurrent, isCancelled)}>
                {isCancelled ? "×" : isDone ? "✓" : index + 1}
              </div>
              {index < steps.length - 1 && (
                <div style={timelineLineStyle(isDone)} />
              )}
            </div>
            <div style={timelineLabelStyle(isCurrent)}>{step.label}</div>
          </div>
        );
      })}
    </div>
  );
}

function ResultList({ match }: { match: MatchState }) {
  return (
    <div style={{ display: "grid", gap: "0.5rem" }}>
      {match.players.map((player) => (
        <div key={player.userId} style={resultRowStyle}>
          <div
            style={{ display: "flex", alignItems: "center", gap: "0.65rem" }}
          >
            <AvatarCell
              username={player.user.username}
              avatar={player.user.avatar}
              size={30}
            />
            <span>{player.user.username}</span>
          </div>
          <strong
            style={{
              color: (player.mmrDelta ?? 0) >= 0 ? "#4ade80" : "#f87171",
            }}
          >
            {(player.mmrDelta ?? 0) >= 0 ? "+" : ""}
            {player.mmrDelta ?? 0} MMR
          </strong>
        </div>
      ))}
    </div>
  );
}

function TeamColumn({
  team,
  teamNumber,
}: {
  team: ReturnType<typeof toDisplayTeam>;
  teamNumber: 1 | 2;
}) {
  const colors = TEAM_COLORS[teamNumber];

  return (
    <div
      style={{
        ...teamColumnStyle,
        borderColor: colors.border,
        background: colors.surface,
      }}
    >
      <div style={{ display: "grid", gap: "0.35rem" }}>
        <div style={{ ...eyebrowStyle, color: colors.accent }}>
          {teamNumber === 1 ? "Blue side" : "Red side"}
        </div>
        <div style={{ fontFamily: "var(--font-display)", fontSize: "1.3rem" }}>
          {team.name}
        </div>
        <div style={{ color: "#cbd5e1", fontSize: "0.92rem" }}>
          Capitán: <strong>{team.captainName}</strong>
        </div>
      </div>

      <div style={{ display: "grid", gap: "0.5rem" }}>
        {team.players.map((player) => (
          <div
            key={player.id}
            style={{
              ...playerCardStyle(player.placeholder),
              flexDirection: "column",
              alignItems: "stretch",
              gap: "0.5rem",
              padding: "0.65rem 0.75rem",
            }}
          >
            {/* Top row: avatar + name + badge */}
            <div style={{ display: "flex", alignItems: "center", gap: "0.55rem", minWidth: 0 }}>
              <AvatarCell username={player.name} avatar={player.avatar} size={32} />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", fontSize: "0.88rem" }}>
                  {player.name}
                </div>
                <div style={{ color: "#94a3b8", fontSize: "0.72rem" }}>
                  {player.placeholder
                    ? "Bot de testing"
                    : player.isCaptain
                      ? "★ Capitán"
                      : "Jugador"}
                </div>
              </div>
              {player.placeholder ? (
                <div style={{ color: "#64748b", fontWeight: 700, fontSize: "0.72rem" }}>BOT</div>
              ) : (
                <LevelBadge level={player.level} color={LEVEL_COLORS[player.level] ?? colors.accent} />
              )}
            </div>

            {/* Stats row — solo para jugadores reales */}
            {!player.placeholder && (
              <div style={{ display: "grid", gap: "0.3rem" }}>
                {/* Winrate label + bar */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.4rem" }}>
                  <div style={{ fontSize: "0.68rem", color: "#64748b", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em" }}>
                    Win%
                  </div>
                  <div style={{ fontSize: "0.75rem", fontWeight: 800, color: player.winrate >= 50 ? "#4ade80" : "#f87171" }}>
                    {player.winrate}%
                    <span style={{ color: "#475569", fontWeight: 400, marginLeft: "0.3rem", fontSize: "0.65rem" }}>
                      {player.wins}W·{player.losses}L
                    </span>
                  </div>
                </div>
                {/* Progress bar */}
                <div style={{ height: "3px", background: "rgba(148,163,184,0.15)", borderRadius: "2px", overflow: "hidden" }}>
                  <div style={{
                    height: "100%",
                    width: `${player.winrate}%`,
                    background: player.winrate >= 50
                      ? "linear-gradient(90deg, #22c55e, #4ade80)"
                      : "linear-gradient(90deg, #ef4444, #f87171)",
                    transition: "width 0.4s ease",
                    borderRadius: "2px",
                  }} />
                </div>
                {/* Last 5 matches */}
                {player.recentMatches.length > 0 && (
                  <div style={{ display: "flex", alignItems: "center", gap: "0.25rem", marginTop: "0.1rem" }}>
                    <span style={{ fontSize: "0.62rem", color: "#475569", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", marginRight: "0.1rem" }}>
                      Últimas
                    </span>
                    {player.recentMatches.map((m, i) => (
                      <div
                        key={i}
                        title={m.won ? `Victoria${m.map ? ` · ${m.map}` : ""}` : `Derrota${m.map ? ` · ${m.map}` : ""}`}
                        style={{
                          width: "14px",
                          height: "14px",
                          borderRadius: "2px",
                          background: m.won ? "rgba(74,222,128,0.2)" : "rgba(248,113,113,0.2)",
                          border: `1px solid ${m.won ? "rgba(74,222,128,0.5)" : "rgba(248,113,113,0.5)"}`,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: "0.52rem",
                          fontWeight: 900,
                          color: m.won ? "#4ade80" : "#f87171",
                          flexShrink: 0,
                        }}
                      >
                        {m.won ? "W" : "L"}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function LevelBadge({ level, color }: { level: number; color: string }) {
  return (
    <div
      title={`Nivel ${level}`}
      style={{
        position: "relative",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: "32px",
        height: "32px",
        flexShrink: 0,
      }}
    >
      {/* Outer hex ring */}
      <svg
        width="32"
        height="32"
        viewBox="0 0 32 32"
        style={{ position: "absolute", inset: 0 }}
      >
        <polygon
          points="16,2 28,9 28,23 16,30 4,23 4,9"
          fill={`${color}18`}
          stroke={color}
          strokeWidth="1.5"
        />
      </svg>
      {/* Level number */}
      <span
        style={{
          position: "relative",
          fontFamily: "var(--font-display)",
          fontSize: level >= 10 ? "0.62rem" : "0.75rem",
          fontWeight: 900,
          color,
          letterSpacing: "-0.02em",
          lineHeight: 1,
          textShadow: `0 0 8px ${color}80`,
        }}
      >
        {level}
      </span>
    </div>
  );
}

function AvatarCell({
  username,
  avatar,
  size = 34,
}: {
  username: string;
  avatar: string | null;
  size?: number;
}) {
  return (
    <div
      style={{
        width: `${size}px`,
        height: `${size}px`,
        borderRadius: "0",
        overflow: "hidden",
        border: "1px solid rgba(148,163,184,0.35)",
        background: "linear-gradient(135deg, #1a3a5c, #0d2040)",
        display: "grid",
        placeItems: "center",
        color: "var(--nexus-accent)",
        fontFamily: "var(--font-display)",
        fontWeight: 800,
        fontSize: size <= 30 ? "0.65rem" : "0.75rem",
        flexShrink: 0,
      }}
    >
      {avatar ? (
        <img
          src={avatar}
          alt={username}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            display: "block",
          }}
        />
      ) : (
        username.slice(0, 2).toUpperCase()
      )}
    </div>
  );
}

function StageCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <div style={stageCardStyle}>
      <div>
        <div style={eyebrowStyle}>{title}</div>
        <div style={{ color: "#e2e8f0", fontWeight: 700 }}>{subtitle}</div>
      </div>
      <div style={{ display: "grid", gap: "1rem" }}>{children}</div>
    </div>
  );
}

function MatchChatPanel({
  currentUserId,
  messages,
  draft,
  remainingChars,
  canSend,
  onDraftChange,
  onSubmit,
}: {
  currentUserId: string;
  messages: ChatMessage[];
  draft: string;
  remainingChars: number;
  canSend: boolean;
  onDraftChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const listEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    listEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  return (
    <div style={chatPanelStyle}>
      <div style={chatListStyle}>
        {messages.length === 0 ? (
          <div style={chatEmptyStateStyle}>
            Todavía no hay mensajes. Coordiná acá con tu equipo.
          </div>
        ) : (
          messages.map((message) => {
            const mine = message.userId === currentUserId;
            return (
              <div
                key={message.id}
                style={chatMessageRowStyle(mine)}
              >
                <AvatarCell
                  username={message.username}
                  avatar={message.avatar}
                  size={28}
                />
                <div style={{ display: "grid", gap: "0.2rem" }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.45rem",
                    }}
                  >
                    <span
                      style={{
                        color: mine ? "#7dd3fc" : "#e2e8f0",
                        fontWeight: 800,
                        fontSize: "0.85rem",
                      }}
                    >
                      {mine ? "Vos" : message.username}
                    </span>
                    <span style={chatTimestampStyle}>
                      {formatChatTime(message.timestamp)}
                    </span>
                  </div>
                  <span style={chatContentStyle}>{message.content}</span>
                </div>
              </div>
            );
          })
        )}
        <div ref={listEndRef} />
      </div>

      <form onSubmit={onSubmit} style={chatComposerStyle}>
        <input
          value={draft}
          onChange={(event) => onDraftChange(event.target.value)}
          maxLength={500}
          disabled={!canSend}
          placeholder={
            canSend
              ? "Escribí un mensaje para el lobby..."
              : "Chat deshabilitado"
          }
          style={chatInputStyle}
        />
        <button
          type="submit"
          disabled={!canSend || !draft.trim()}
          style={chatSendButtonStyle(!canSend || !draft.trim())}
        >
          Enviar
        </button>
      </form>
      <div style={chatCounterStyle(remainingChars <= 50)}>
        {remainingChars} caracteres restantes
      </div>
    </div>
  );
}

function VotePill({
  label,
  votes,
  color,
}: {
  label: string;
  votes: number;
  color: string;
}) {
  return (
    <div
      style={{
        border: `1px solid ${color}66`,
        borderRadius: "12px",
        padding: "0.85rem 1rem",
        textAlign: "center",
      }}
    >
      <div
        style={{
          color: "#94a3b8",
          fontSize: "0.8rem",
          textTransform: "uppercase",
          letterSpacing: "0.15em",
        }}
      >
        {label}
      </div>
      <div
        style={{
          color,
          fontFamily: "var(--font-display)",
          fontSize: "1.35rem",
          marginTop: "0.25rem",
        }}
      >
        {votes} voto(s)
      </div>
    </div>
  );
}

function toDisplayTeam(players: Player[], teamNumber: 1 | 2) {
  const realPlayers = [...players].sort(
    (a, b) => Number(b.isCaptain) - Number(a.isCaptain),
  );
  const leader = realPlayers[0]?.user.username ?? `Equipo ${teamNumber}`;
  const captain =
    realPlayers.find((player) => player.isCaptain)?.user.username ?? leader;

  const padded = [
    ...realPlayers.map((player) => ({
      id: player.userId ?? `bot-${player.team}-${player.user.id}`,
      name: player.user.username,
      avatar: player.user.avatar,
      level: parseLevelFromRank(player.user.rank),
      isCaptain: player.isCaptain,
      placeholder: Boolean(player.isBot),
      winrate: player.user.winrate ?? 0,
      wins: player.user.wins ?? 0,
      losses: player.user.losses ?? 0,
      recentMatches: player.user.recentMatches ?? [],
    })),
  ];

  while (padded.length < 5) {
    padded.push({
      id: `mock-${teamNumber}-${padded.length}`,
      name: `${teamNumber === 1 ? "Blue" : "Red"} Mock ${padded.length}`,
      avatar: null,
      level: 1,
      isCaptain: false,
      placeholder: true,
      winrate: 0,
      wins: 0,
      losses: 0,
      recentMatches: [],
    });
  }

  return {
    name: `Team ${leader}`,
    captainName: captain,
    players: padded,
  };
}

function parseLevelFromRank(rank: string) {
  const rankLevel = Number(rank.replace("LVL_", ""));
  if (!Number.isNaN(rankLevel) && rankLevel >= 1 && rankLevel <= 10) {
    return rankLevel;
  }
  return 1;
}

function getCurrentVetoTurn(match: MatchState) {
  const veto = match.runtime?.veto;
  if (!veto) return null;

  const nextTeamCandidate = veto.currentTurn || veto.vetoOrder[veto.vetoIndex];
  const nextTeam =
    nextTeamCandidate === 1 || nextTeamCandidate === 2
      ? nextTeamCandidate
      : null;
  if (!nextTeam) return null;

  const captainId = veto.captains[nextTeam];
  if (!nextTeam || !captainId) return null;

  return {
    team: nextTeam as 1 | 2,
    captainId,
  };
}

function getRemainingMaps(match: MatchState) {
  if (match.runtime?.veto?.remainingMaps?.length) {
    return match.runtime.veto.remainingMaps
      .map((mapId) => getMapNameFromId(mapId))
      .filter(Boolean) as string[];
  }

  const bannedMapIds = new Set(
    match.vetoes
      .map((veto) => veto.mapId || MAP_ID_BY_NAME[veto.mapName])
      .filter(Boolean),
  );

  return HOTS_MAPS.filter((map) => !bannedMapIds.has(map.id)).map(
    (map) => map.name,
  );
}

function getSelectedMapFromVeto(match: MatchState) {
  const remaining = getRemainingMaps(match);
  return remaining.length === 1 ? remaining[0] : "Mapa pendiente";
}

function getMapNameFromId(mapId: string) {
  return MAP_NAME_BY_ID[mapId];
}

function getMapIdFromName(mapName: string) {
  return MAP_ID_BY_NAME[mapName] ?? "";
}

function formatDuration(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function formatChatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--:--";
  return date.toLocaleTimeString("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

const pageShellStyle: CSSProperties = {
  minHeight: "calc(100vh - 80px)",
  padding: "1.5rem 0 2rem",
  position: "relative",
};

const panelStyle: CSSProperties = {
  width: "100%",
  background:
    "linear-gradient(180deg, var(--nexus-surface), rgba(8,12,20,0.98))",
  border: "1px solid var(--nexus-border)",
  borderRadius: "0",
  boxShadow: "0 24px 70px rgba(0, 0, 0, 0.28)",
  padding: "1.25rem",
  display: "grid",
  gap: "1.25rem",
};

const headerStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: "1rem",
};

const teamsGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr minmax(360px, 480px) 1fr",
  gap: "1rem",
  alignItems: "start",
};

const teamColumnStyle: CSSProperties = {
  border: "1px solid",
  borderRadius: "0",
  padding: "1rem",
  display: "grid",
  gap: "1rem",
  background:
    "linear-gradient(180deg, rgba(13,20,34,0.94), rgba(8,12,20,0.94))",
};

const stageCardStyle: CSSProperties = {
  border: "1px solid var(--nexus-border)",
  borderRadius: "0",
  padding: "1rem",
  display: "grid",
  gap: "1rem",
  background: "var(--nexus-card)",
};

const chatPanelStyle: CSSProperties = {
  display: "grid",
  gap: "0.65rem",
};

const chatListStyle: CSSProperties = {
  maxHeight: "240px",
  overflowY: "auto",
  border: "1px solid rgba(148,163,184,0.18)",
  background: "rgba(2,6,23,0.55)",
  padding: "0.65rem",
  display: "grid",
  gap: "0.55rem",
};

const chatEmptyStateStyle: CSSProperties = {
  color: "#94a3b8",
  fontSize: "0.9rem",
  textAlign: "center",
  padding: "0.75rem 0.5rem",
};

function chatMessageRowStyle(mine: boolean): CSSProperties {
  return {
    display: "grid",
    gridTemplateColumns: "28px 1fr",
    gap: "0.55rem",
    alignItems: "start",
    border: "1px solid rgba(148,163,184,0.12)",
    background: mine
      ? "rgba(14,116,144,0.18)"
      : "rgba(15,23,42,0.55)",
    padding: "0.5rem",
  };
}

const chatTimestampStyle: CSSProperties = {
  color: "#94a3b8",
  fontSize: "0.72rem",
  letterSpacing: "0.04em",
};

const chatContentStyle: CSSProperties = {
  color: "#e2e8f0",
  fontSize: "0.9rem",
  lineHeight: 1.35,
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
};

const chatComposerStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr auto",
  gap: "0.55rem",
};

const chatInputStyle: CSSProperties = {
  border: "1px solid rgba(148,163,184,0.3)",
  background: "rgba(2,6,23,0.72)",
  color: "#e2e8f0",
  padding: "0.7rem 0.8rem",
  outline: "none",
};

function chatSendButtonStyle(disabled: boolean): CSSProperties {
  return {
    border: "1px solid rgba(0,200,255,0.35)",
    background: disabled
      ? "rgba(30,41,59,0.6)"
      : "linear-gradient(90deg, #00c8ff, #38bdf8)",
    color: disabled ? "#94a3b8" : "#020617",
    fontWeight: 800,
    padding: "0.7rem 0.9rem",
    cursor: disabled ? "not-allowed" : "pointer",
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    fontSize: "0.72rem",
  };
}

function chatCounterStyle(urgent: boolean): CSSProperties {
  return {
    color: urgent ? "#fda4af" : "#94a3b8",
    fontSize: "0.75rem",
    textAlign: "right",
  };
}

const mapGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: "0.5rem",
};

function MapSelectedCard({ mapName }: { mapName: string }) {
  const [imgFailed, setImgFailed] = useState(false);
  const imageUrl = getMapImageUrl(mapName);
  const backdrop =
    MAP_BACKDROPS[mapName] ??
    "linear-gradient(135deg, rgba(0,200,255,0.25), rgba(15,23,42,0.95))";

  return (
    <div
      style={{
        position: "relative",
        minHeight: "180px",
        borderRadius: "2px",
        overflow: "hidden",
        border: "1px solid rgba(148,163,184,0.18)",
        background: "#0d1422",
        display: "flex",
        flexDirection: "column",
        justifyContent: "flex-end",
      }}
    >
      {/* Background map image */}
      {imageUrl && !imgFailed && (
        <img
          src={imageUrl}
          alt=""
          aria-hidden
          onError={() => setImgFailed(true)}
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
            opacity: 1,
            filter: "brightness(0.65) saturate(1.1)",
          }}
        />
      )}
      {/* Fallback o overlay viñetado */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: imgFailed || !imageUrl
            ? backdrop
            : "linear-gradient(to top, rgba(0,0,0,0.88) 0%, rgba(0,0,0,0.1) 55%, transparent 100%)",
        }}
      />
      {/* Content */}
      <div
        style={{
          position: "relative",
          zIndex: 1,
          padding: "1rem 1.1rem",
          display: "flex",
          flexDirection: "column",
          gap: "0.2rem",
        }}
      >
        <div
          style={{
            fontSize: "0.68rem",
            textTransform: "uppercase",
            letterSpacing: "0.22em",
            color: "rgba(203,213,225,0.75)",
            fontWeight: 700,
          }}
        >
          Battleground elegido
        </div>
        <div
          style={{
            fontFamily: "var(--font-display)",
            fontSize: "1.6rem",
            fontWeight: 900,
            lineHeight: 1.1,
            textShadow: "0 2px 12px rgba(0,0,0,0.8)",
          }}
        >
          {mapName}
        </div>
      </div>
    </div>
  );
}

function MapVetoCard({
  mapName,
  active,
  onBan,
}: {
  mapName: string;
  active: boolean;
  onBan: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const [imgFailed, setImgFailed] = useState(false);
  const imageUrl = getMapImageUrl(mapName);
  const backdrop =
    MAP_BACKDROPS[mapName] ??
    "linear-gradient(135deg, rgba(0,200,255,0.25), rgba(15,23,42,0.95))";

  const isBanning = active && hovered;

  return (
    <button
      onClick={active ? onBan : undefined}
      disabled={!active}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: "relative",
        border: `1px solid ${isBanning ? "rgba(248,113,113,0.7)" : active ? "rgba(148,163,184,0.25)" : "rgba(100,116,139,0.15)"}`,
        borderRadius: "2px",
        padding: 0,
        overflow: "hidden",
        cursor: active ? "pointer" : "not-allowed",
        aspectRatio: "16/7",
        background: "#0d1422",
        transition: "border-color 0.15s, transform 0.12s",
        transform: isBanning ? "scale(1.02)" : "scale(1)",
        outline: "none",
      }}
    >
      {/* Background image — full width/height, visible when loaded */}
      {imageUrl && !imgFailed && (
        <img
          src={imageUrl}
          alt=""
          aria-hidden
          onError={() => setImgFailed(true)}
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
            opacity: active ? 1 : 0.35,
            filter: isBanning ? "brightness(0.45)" : active ? "brightness(0.75)" : "brightness(0.4) saturate(0.6)",
            transition: "opacity 0.15s, filter 0.15s",
          }}
        />
      )}
      {/* Backdrop gradient — shown always when no image, or as bottom vignette when image exists */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: imgFailed || !imageUrl
            ? isBanning
              ? "linear-gradient(to top, rgba(248,113,113,0.55) 0%, rgba(0,0,0,0.4) 100%)"
              : backdrop
            : isBanning
              ? "linear-gradient(to top, rgba(200,30,30,0.7) 0%, transparent 55%)"
              : "linear-gradient(to top, rgba(0,0,0,0.75) 0%, transparent 50%)",
          transition: "background 0.15s",
        }}
      />
      {/* Ban X overlay on hover */}
      {isBanning && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 2,
          }}
        >
          <span
            style={{
              fontSize: "1.8rem",
              fontWeight: 900,
              color: "#fff",
              textShadow: "0 0 16px rgba(248,113,113,1)",
              lineHeight: 1,
            }}
          >
            ✕
          </span>
        </div>
      )}
      {/* Map name label */}
      <div
        style={{
          position: "relative",
          zIndex: 1,
          padding: "0.5rem 0.6rem",
          display: "flex",
          flexDirection: "column",
          justifyContent: "flex-end",
          height: "100%",
          boxSizing: "border-box",
        }}
      >
        <span
          style={{
            fontFamily: "var(--font-display)",
            fontSize: "0.7rem",
            fontWeight: 800,
            color: active ? "#fff" : "#64748b",
            letterSpacing: "0.04em",
            textTransform: "uppercase",
            lineHeight: 1.2,
            textShadow: active ? "0 1px 4px rgba(0,0,0,0.8)" : "none",
          }}
        >
          {mapName}
        </span>
      </div>
    </button>
  );
}

const primaryButtonStyle: CSSProperties = {
  border: "1px solid rgba(0, 200, 255, 0.4)",
  borderRadius: "0",
  padding: "0.95rem 1rem",
  background: "linear-gradient(90deg, #00c8ff, #38bdf8)",
  color: "#020617",
  fontWeight: 800,
  cursor: "pointer",
  textTransform: "uppercase",
  letterSpacing: "0.08em",
};

function finishButtonStyle(disabled: boolean): CSSProperties {
  return {
    border: "1px solid rgba(74, 222, 128, 0.5)",
    borderRadius: "0",
    padding: "0.95rem 1rem",
    background: disabled
      ? "rgba(34,197,94,0.35)"
      : "linear-gradient(90deg, #22c55e, #16a34a)",
    color: "#020617",
    fontWeight: 800,
    cursor: disabled ? "not-allowed" : "pointer",
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    fontSize: "1rem",
    opacity: disabled ? 0.7 : 1,
  };
}

const ghostButtonStyle: CSSProperties = {
  border: "1px solid var(--nexus-border-active)",
  borderRadius: "0",
  padding: "0.75rem 1rem",
  background: "transparent",
  color: "#e2e8f0",
  cursor: "pointer",
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  fontWeight: 700,
};

const eyebrowStyle: CSSProperties = {
  color: "#94a3b8",
  textTransform: "uppercase",
  letterSpacing: "0.18em",
  fontSize: "0.72rem",
  fontWeight: 800,
};

const resultRowStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: "1rem",
  padding: "0.8rem 0.95rem",
  borderRadius: "0",
  background: "rgba(15,23,42,0.75)",
  border: "1px solid rgba(148,163,184,0.14)",
};

const infoBannerStyle: CSSProperties = {
  padding: "0.85rem 1rem",
  borderRadius: "0",
  border: "1px solid rgba(251,191,36,0.35)",
  background: "rgba(251,191,36,0.08)",
  color: "#fde68a",
  fontWeight: 700,
};

const timelineWrapStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(5, 1fr)",
  gap: "0.75rem",
  alignItems: "start",
};

const timelineStepStyle: CSSProperties = {
  display: "grid",
  gap: "0.55rem",
};

const timelineNodeRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
};

const timelineLabelStyle = (active: boolean): CSSProperties => ({
  color: active ? "#e2e8f0" : "#94a3b8",
  fontSize: "0.8rem",
  fontWeight: active ? 800 : 700,
  textTransform: "uppercase",
  letterSpacing: "0.12em",
});

function timelineNodeStyle(
  done: boolean,
  current: boolean,
  cancelled: boolean,
): CSSProperties {
  return {
    width: "34px",
    height: "34px",
    borderRadius: "999px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontFamily: "var(--font-display)",
    fontWeight: 800,
    border: `1px solid ${
      cancelled
        ? "rgba(248,113,113,0.5)"
        : current
          ? "rgba(0,200,255,0.6)"
          : done
            ? "rgba(74,222,128,0.45)"
            : "rgba(148,163,184,0.25)"
    }`,
    background: cancelled
      ? "rgba(127,29,29,0.35)"
      : current
        ? "rgba(0,200,255,0.16)"
        : done
          ? "rgba(74,222,128,0.14)"
          : "rgba(15,23,42,0.82)",
    color: cancelled
      ? "#fecaca"
      : current
        ? "#7dd3fc"
        : done
          ? "#86efac"
          : "#94a3b8",
    flexShrink: 0,
  };
}

function timelineLineStyle(active: boolean): CSSProperties {
  return {
    flex: 1,
    height: "2px",
    marginInline: "0.55rem",
    background: active
      ? "linear-gradient(90deg, #22c55e, #38bdf8)"
      : "rgba(148,163,184,0.2)",
  };
}

function voteButtonStyle(team: 1 | 2, selected: boolean): CSSProperties {
  const colors = TEAM_COLORS[team];
  return {
    flex: 1,
    border: `1px solid ${selected ? colors.accent : colors.border}`,
    borderRadius: "0",
    padding: "1rem",
    background: selected ? `${colors.accent}22` : colors.surface,
    color: "#fff",
    cursor: "pointer",
    fontWeight: 800,
  };
}

function timerBadgeStyle(urgent: boolean): CSSProperties {
  return {
    justifySelf: "center",
    padding: "0.5rem 0.85rem",
    borderRadius: "999px",
    border: `1px solid ${urgent ? "rgba(248,113,113,0.55)" : "rgba(0,200,255,0.35)"}`,
    color: urgent ? "#fca5a5" : "#7dd3fc",
    fontFamily: "var(--font-display)",
    letterSpacing: "0.14em",
    fontWeight: 700,
  };
}

function playerCardStyle(placeholder: boolean): CSSProperties {
  return {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "0.75rem",
    borderRadius: "0",
    padding: "0.85rem 0.95rem",
    background: placeholder ? "rgba(30,41,59,0.45)" : "rgba(15,23,42,0.78)",
    border: `1px solid ${placeholder ? "rgba(100,116,139,0.25)" : "rgba(148,163,184,0.18)"}`,
  };
}

function winnerBannerStyle(color: string): CSSProperties {
  return {
    borderRadius: "0",
    padding: "1rem",
    textAlign: "center",
    fontFamily: "var(--font-display)",
    fontSize: "1.3rem",
    color,
    border: `1px solid ${color}66`,
    background: `${color}1c`,
  };
}

function dangerButtonStyle(disabled: boolean): CSSProperties {
  return {
    border: "1px solid rgba(248,113,113,0.35)",
    borderRadius: "0",
    padding: "0.75rem 1rem",
    background: disabled ? "rgba(248,113,113,0.12)" : "rgba(127,29,29,0.25)",
    color: "#fecaca",
    cursor: disabled ? "not-allowed" : "pointer",
    fontWeight: 800,
    textTransform: "uppercase",
    letterSpacing: "0.08em",
  };
}
