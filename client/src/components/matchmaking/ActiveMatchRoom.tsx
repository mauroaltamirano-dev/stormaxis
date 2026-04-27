import type { ChangeEvent, CSSProperties, ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  HERO_BY_ID,
  HERO_ID_BY_NAME,
  HOTS_HEROES,
  HOTS_MAPS,
  MAP_ID_BY_NAME,
  MAP_NAME_BY_ID,
  type HotsHero,
} from "@nexusgg/shared";
import { RankBadge } from "../RankBadge";
import { getMatchLifecycleMeta } from "../../lib/competitiveStatus";
import { getCountryFlag } from "../../lib/countries";

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
    countryCode?: string | null;
    recentMatches?: Array<{ won: boolean; map: string | null; date: string }>;
  };
};

type MatchState = {
  id: string;
  status: MatchStatus;
  selectedMap?: string | null;
  winner?: 1 | 2 | null;
  mvpUserId?: string | null;
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
  mvpVotes?: Array<{ userId: string; nomineeUserId: string }>;
  replayUploads?: ReplayUpload[];
  discordVoice?: {
    enabled: boolean;
    status: "disabled" | "spectator" | "missing_link" | "pending" | "ready";
    hasLinkedDiscord: boolean;
    team: 1 | 2 | null;
    teamInviteUrl: string | null;
  };
  runtime?: {
    ready: { readyBy: string[]; totalPlayers: number } | null;
    voting: { expiresAt: number; totalPlayers: number } | null;
    mvpVoting: { expiresAt: number; totalPlayers: number } | null;
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
    presence?: { onlineUserIds: string[]; updatedAt: number } | null;
    voteCounts: { team1Votes: number; team2Votes: number; total: number };
    mvpVoteCounts: Array<{ nomineeUserId: string; votes: number }>;
  } | null;
};

type ReplayResolutionStatus =
  | "auto_result_applied"
  | "verified_existing_result"
  | "winner_mismatch"
  | "awaiting_manual_vote"
  | "insufficient_data"
  | "parser_failed";

type ReplayUpload = {
  id: string;
  matchId?: string;
  uploadedById?: string | null;
  status: "UPLOADED" | "PARSED" | "FAILED" | string;
  originalName: string;
  fileSize: number;
  sha256?: string;
  parsedMap: string | null;
  parsedGameMode: string | null;
  parsedRegion?: number | null;
  parsedBuild?: number | null;
  parsedDuration: number | null;
  parsedGameDate?: string | Date | null;
  parsedWinnerTeam: 1 | 2 | null;
  parserStatus: string | null;
  parseError: string | null;
  parsedSummary?: {
    validation?: {
      mapMatches?: boolean;
      expectedHumanPlayers?: number;
      matchedPlayers?: number;
      minimumMatchedPlayers?: number;
      winnerDetected?: 1 | 2 | null;
      battleTagLinkedPlayers?: number;
      battleTagMatchedPlayers?: number;
      usernameMatchedPlayers?: number;
      missingBattleTagPlayers?: number;
      battleTagMismatches?: number;
      teamMismatches?: number;
      identityConfidence?: "high" | "medium" | "low";
      trustScore?: number;
      issues?: string[];
    };
    resolution?: {
      status?: ReplayResolutionStatus;
      message?: string;
      autoApplied?: boolean;
      replayWinner?: 1 | 2 | null;
      existingWinner?: 1 | 2 | null;
      eligibleForAutoWinner?: boolean;
      identityConfidence?: "high" | "medium" | "low";
      trustScore?: number;
      battleTagMatchedPlayers?: number;
      battleTagMismatches?: number;
      teamMismatches?: number;
      decidedAt?: string;
    };
    match?: {
      map?: string | null;
      gameMode?: string | null;
      region?: number | null;
      build?: number | null;
      duration?: number | null;
      gameDate?: string | null;
      winnerTeam?: 1 | 2 | null;
    };
    players?: Array<{
      name: string;
      battleTag: string | null;
      hero: string | null;
      team: 1 | 2 | null;
      won: boolean;
      takedowns?: number | null;
      kills?: number | null;
      deaths?: number | null;
      assists?: number | null;
      heroDamage?: number | null;
      siegeDamage?: number | null;
      structureDamage?: number | null;
      minionDamage?: number | null;
      healing?: number | null;
      selfHealing?: number | null;
      damageTaken?: number | null;
      protection?: number | null;
      experience?: number | null;
      mercCampCaptures?: number | null;
      timeSpentDead?: number | null;
      ccTime?: number | null;
      stunTime?: number | null;
      rootTime?: number | null;
      silenceTime?: number | null;
      teamfightHeroDamage?: number | null;
      teamfightHealing?: number | null;
      teamfightDamageTaken?: number | null;
      gameScore?: number | null;
      highestKillStreak?: number | null;
      talents?: Array<{ tier: string; name: string }>;
      awards?: string[];
    }>;
    warnings?: string[];
  } | null;
  uploadedBy?: { id: string; username: string } | null;
  createdAt: string;
};

type Props = {
  currentUserId: string;
  currentUserRole?: string;
  match: MatchState;
  onBanMap: (mapId: string) => void;
  onReady: () => void;
  onFinishMatch: () => void;
  onVote: (winner: 1 | 2) => void;
  onMvpVote: (nomineeUserId: string) => void;
  onUploadReplay: (file: File) => Promise<ReplayUpload>;
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

const TEAM_BACKDROPS = {
  1: "/images/greymane_1920x1200.thumb.webp",
  2: "/images/Mephisto_1920x1200.thumb.webp",
} as const;

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
  const id = MAP_ID_BY_NAME[mapName];
  if (!id) return "";
  return `/maps/${id}.webp`;
}

export function ActiveMatchRoom({
  currentUserId,
  currentUserRole,
  match,
  onBanMap,
  onReady,
  onFinishMatch,
  onVote,
  onMvpVote,
  onUploadReplay,
  onCancelMatch,
  onBack,
}: Props) {
  const [now, setNow] = useState(Date.now());
  const [replayUploadState, setReplayUploadState] = useState<{
    status: "idle" | "uploading" | "success" | "error";
    message: string | null;
  }>({ status: "idle", message: null });
  const replayInputRef = useRef<HTMLInputElement | null>(null);
  const [viewportWidth, setViewportWidth] = useState(
    typeof window === "undefined" ? 1440 : window.innerWidth,
  );

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const handleResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const presenceKnown = Array.isArray(match.runtime?.presence?.onlineUserIds);
  const onlineUserIds = useMemo(
    () => new Set(match.runtime?.presence?.onlineUserIds ?? []),
    [match.runtime?.presence?.onlineUserIds],
  );
  const mvpVoteCounts = useMemo(
    () => getAggregatedMvpVoteCounts(
      match.runtime?.mvpVoteCounts ?? [],
      match.mvpVotes ?? [],
    ),
    [match.runtime?.mvpVoteCounts, match.mvpVotes],
  );

  const teams = useMemo(() => {
    const left = toDisplayTeam(
      match.players.filter((player) => player.team === 1),
      1,
      match.status,
      match.winner ?? null,
      match.mvpUserId ?? null,
      presenceKnown ? onlineUserIds : null,
      mvpVoteCounts,
    );
    const right = toDisplayTeam(
      match.players.filter((player) => player.team === 2),
      2,
      match.status,
      match.winner ?? null,
      match.mvpUserId ?? null,
      presenceKnown ? onlineUserIds : null,
      mvpVoteCounts,
    );
    return { left, right };
  }, [match.players, match.status, match.winner, match.mvpUserId, onlineUserIds, presenceKnown, mvpVoteCounts]);

  const currentPlayer = match.players.find(
    (player) => player.userId === currentUserId,
  );
  const isParticipant = Boolean(currentPlayer && !currentPlayer.isBot);
  const isSpectator = !isParticipant;
  const humanPlayers = match.players.filter((player) => !player.isBot);
  const humanPlayersCount = humanPlayers.length;
  const onlineHumanCount = presenceKnown
    ? humanPlayers.filter((player) => player.userId && onlineUserIds.has(player.userId)).length
    : humanPlayersCount;
  const offlinePlayers = presenceKnown
    ? humanPlayers.filter((player) => player.userId && !onlineUserIds.has(player.userId))
    : [];
  const hasOfflinePlayers = offlinePlayers.length > 0;
  const currentVote =
    match.votes?.find((vote) => vote.userId === currentUserId)?.winner ?? null;
  const currentMvpVote =
    match.mvpVotes?.find((vote) => vote.userId === currentUserId)
      ?.nomineeUserId ?? null;
  const readyBy = match.runtime?.ready?.readyBy ?? [];
  const isReady = readyBy.includes(currentUserId);
  const totalReadyPlayers =
    match.runtime?.ready?.totalPlayers ?? humanPlayersCount;
  const allConnected = readyBy.length === totalReadyPlayers;
  const voteCounts = match.runtime?.voteCounts ?? {
    team1Votes: 0,
    team2Votes: 0,
    total: 0,
  };
  const votingExpiresAt = match.runtime?.voting?.expiresAt ?? null;
  const mvpVotingExpiresAt = match.runtime?.mvpVoting?.expiresAt ?? null;
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
  const mvpVotingSeconds = mvpVotingExpiresAt
    ? Math.max(0, Math.round((mvpVotingExpiresAt - now) / 1000))
    : null;
  const selectedMap = match.selectedMap ?? getSelectedMapFromVeto(match);
  const isCaptainTurn = Boolean(
    isParticipant &&
    match.status === "VETOING" &&
    currentPlayer?.isCaptain &&
    currentPlayer.userId === vetoTurn?.captainId,
  );
  const cancelState = match.runtime?.cancel;
  const canRequestCancel = Boolean(
    isParticipant &&
    currentPlayer?.isCaptain &&
    ["VETOING", "PLAYING", "VOTING"].includes(match.status),
  );
  const canUploadReplay =
    match.status === "COMPLETED" &&
    (currentUserRole === "ADMIN" ||
      (isParticipant && Boolean(currentPlayer?.isCaptain)));
  const cancelRequestedByMe =
    cancelState?.requestedBy.includes(currentUserId) ?? false;
  const statusMeta = getMatchLifecycleMeta(match.status, allConnected);
  const isTablet = viewportWidth < 1320;
  const isMobile = viewportWidth < 940;
  const isNarrow = viewportWidth < 720;
  const showDiscordVoicePanel =
    Boolean(match.discordVoice?.enabled) && match.status === "PLAYING";
  const mapCards = useMemo(() => {
    return HOTS_MAPS.map((map) => {
      const veto = match.vetoes.find(
        (entry) => entry.mapId === map.id || entry.mapName === map.name,
      );
      return { mapId: map.id, mapName: map.name, veto };
    });
  }, [match.vetoes]);

  async function handleReplayFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setReplayUploadState({
      status: "uploading",
      message: "Subiendo y procesando replay…",
    });
    try {
      const upload = await onUploadReplay(file);
      const resolutionStatus = upload.parsedSummary?.resolution?.status;
      const resolutionMessage = upload.parsedSummary?.resolution?.message;
      setReplayUploadState({
        status:
          upload.status === "FAILED" || resolutionStatus === "winner_mismatch"
            ? "error"
            : "success",
        message:
          upload.status === "FAILED"
            ? (upload.parseError ??
              "El archivo se subió, pero el parser no pudo leerlo.")
            : (resolutionMessage ??
              "Replay procesado. Ya tenemos metadata real de la partida."),
      });
    } catch (err) {
      setReplayUploadState({
        status: "error",
        message:
          err instanceof Error
            ? err.message
            : "No pude subir el replay. Probá de nuevo.",
      });
    }
  }

  const centerColumn = (
    <div style={centerColumnStyle}>
      {match.status !== "COMPLETED" && match.status !== "CANCELLED" && (
        <MatchOpsStrip
          statusMeta={statusMeta}
          selectedMap={selectedMap}
          allConnected={allConnected}
          readyCount={readyBy.length}
          totalReadyPlayers={totalReadyPlayers}
          presenceKnown={presenceKnown}
          onlineHumanCount={onlineHumanCount}
          humanPlayersCount={humanPlayersCount}
          presenceUpdatedAt={match.runtime?.presence?.updatedAt ?? null}
          hasOfflinePlayers={hasOfflinePlayers}
          offlinePlayerNames={offlinePlayers.map((player) => player.user.username)}
          vetoTurnLabel={
            vetoTurn
              ? vetoTurn.team === 1
                ? teams.left.name
                : teams.right.name
              : null
          }
          vetoSeconds={vetoSeconds}
          voteCount={voteCounts.total}
          voteTotal={match.runtime?.voting?.totalPlayers ?? humanPlayersCount}
          mvpVoteCount={mvpVoteCounts.reduce((sum, entry) => sum + entry.votes, 0)}
          mvpVoteTotal={match.runtime?.mvpVoting?.totalPlayers ?? humanPlayersCount}
          finishApprovals={finishApprovals}
          finishNeeded={finishNeeded}
        />
      )}

      {showDiscordVoicePanel && (
        <StageCard
          title="Discord por equipo"
          subtitle="El acceso al voice queda visible mientras la sala siga activa"
          tone="#5865F2"
        >
          <StageCallout
            tone="#5865F2"
            label="Comando de voz"
            title={
              match.discordVoice?.status === "ready"
                ? `Voice listo para Team ${match.discordVoice.team}`
                : match.discordVoice?.status === "missing_link"
                  ? "Vinculá tu Discord para entrar a voz"
                  : match.discordVoice?.status === "spectator"
                    ? "Modo espectador: links privados ocultos"
                    : "Voice en preparación"
            }
            description={
              match.discordVoice?.status === "ready"
                ? "El link se mantiene visible para que nadie se quede afuera si todavía no abrió Discord."
                : match.discordVoice?.status === "missing_link"
                  ? "Podés seguir en la sala sin voice, pero no vas a recibir enlace privado hasta vincular tu cuenta."
                  : "El sistema solo expone enlaces privados al jugador participante de ese equipo."
            }
            rightSlot={
              match.discordVoice?.status === "ready" &&
              match.discordVoice.teamInviteUrl ? (
                <a
                  href={match.discordVoice.teamInviteUrl}
                  target="_blank"
                  rel="noreferrer"
                  style={primaryButtonStyle}
                >
                  Entrar al voice
                </a>
              ) : match.discordVoice?.status === "missing_link" ? (
                <a href="/profile?tab=accounts" style={primaryButtonStyle}>
                  Vincular Discord
                </a>
              ) : null
            }
          />
        </StageCard>
      )}

      {match.status === "VETOING" && (
        <StageCard
          title="Veto de mapas"
          subtitle={
            vetoTurn
              ? `Turno del ${vetoTurn.team === 1 ? teams.left.name : teams.right.name}`
              : "Esperando turno"
          }
          tone={vetoTurn ? TEAM_COLORS[vetoTurn.team].accent : "#7dd3fc"}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "0.75rem",
              border: "1px solid rgba(148,163,184,0.2)",
              background: "rgba(2,6,23,0.36)",
              padding: "0.55rem 0.65rem",
            }}
          >
            <span
              style={{
                color: "#cbd5e1",
                fontSize: "0.82rem",
                fontWeight: 700,
              }}
            >
              {isCaptainTurn ? "Te toca vetar" : "Esperando acción del capitán"}
            </span>
            <div
              style={timerBadgeStyle(vetoSeconds != null && vetoSeconds <= 10)}
            >
              {vetoSeconds != null
                ? `00:${String(vetoSeconds).padStart(2, "0")}`
                : "—"}
            </div>
          </div>
          <div style={mapGridStyle(isNarrow)}>
            {mapCards.map(({ mapId, mapName, veto }) => (
              <MapVetoCard
                key={mapId}
                mapName={mapName}
                active={isCaptainTurn && !veto}
                bannedBy={
                  veto
                    ? veto.team === 1
                      ? teams.left.name
                      : teams.right.name
                    : null
                }
                bannedByTone={veto ? TEAM_COLORS[veto.team].accent : undefined}
                onBan={() => onBanMap(mapId)}
              />
            ))}
          </div>
          <div style={vetoHintStripStyle}>
            <span style={vetoHintChipStyle("#7dd3fc")}>
              {isSpectator
                ? "Observación en vivo"
                : isCaptainTurn
                  ? "Turno activo"
                  : "Esperando capitán"}
            </span>
            <span style={vetoHintChipStyle("#fbbf24")}>
              {isCaptainTurn
                ? "Si vence el timer, cae auto-ban"
                : "Sólo el capitán del turno puede vetar"}
            </span>
          </div>
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
              title={allConnected ? "Partida en curso" : "Mapa confirmado"}
              subtitle={
                allConnected
                  ? "Cuando termine, los dos capitanes deben marcar Partida terminada."
                  : "Entrá al lobby y marcá que ya empezaste la partida"
              }
              tone={allConnected ? "#4ade80" : "#38bdf8"}
            >
              <StageCallout
                tone={allConnected ? "#4ade80" : "#38bdf8"}
                label={
                  allConnected ? "Fase competitiva" : "Checklist pre-partida"
                }
                title={
                  allConnected
                    ? "La partida ya está corriendo"
                    : "Todo listo para arrancar"
                }
                description={
                  allConnected
                    ? "Cuando la partida termine, ambos capitanes deben confirmar 'Partida terminada' para abrir la votación de ganador y MVP."
                    : "Cada jugador debe marcar Comenzar partida. Cuando todos entren, la sala queda lista para jugar sin perder el acceso al panel de Discord."
                }
                compact
              />
              <MapSelectedCard mapName={selectedMap} compact={isNarrow} dense />
              <ProgressRail
                label="Operatividad de lobby"
                value={connectedCount}
                total={totalPlayers}
                color={allConnected ? "#4ade80" : "#38bdf8"}
              />

              {!allConnected && isParticipant && (
                <button
                  onClick={onReady}
                  disabled={isReady}
                  style={primaryButtonStyle}
                >
                  {isReady ? "Esperando al resto…" : "Comenzar partida"}
                </button>
              )}

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: isNarrow
                    ? "1fr"
                    : "repeat(3, minmax(0, 1fr))",
                  gap: "0.65rem",
                }}
              >
                <StatusTile
                  label="Conectados"
                  value={`${connectedCount}/${totalPlayers}`}
                  tone={allConnected ? "#4ade80" : "#38bdf8"}
                />
                <StatusTile
                  label="Tu estado"
                  value={isReady ? "Reportado" : "Pendiente"}
                  tone={isReady ? "#4ade80" : "#fbbf24"}
                />
                <StatusTile
                  label="Confirmación capitanes"
                  value={`${finishApprovals}/${finishNeeded}`}
                  tone="#fbbf24"
                />
              </div>

              {allConnected && (
                <>
                  {isParticipant && (
                    <button
                      onClick={onFinishMatch}
                      disabled={!isCaptain || alreadyRequestedFinish}
                      style={finishButtonStyle(
                        !isCaptain || alreadyRequestedFinish,
                      )}
                    >
                      ✓ Partida terminada
                    </button>
                  )}
                  <div style={{ color: "#94a3b8", fontSize: "0.86rem" }}>
                    {isSpectator
                      ? "Modo espectador: esperando cierre por capitanes."
                      : alreadyRequestedFinish
                        ? "Ya marcaste tu confirmación. Falta el otro capitán."
                        : isCaptain
                          ? `Requiere confirmación de ambos capitanes: ${finishApprovals}/${finishNeeded}`
                          : "Esperando confirmación de ambos capitanes para cerrar."}
                  </div>
                </>
              )}
            </StageCard>
          );
        })()}

      {match.status === "VOTING" && match.winner && (
        <StageCard
          title="Votación MVP"
          subtitle={`Resultado definido: victoria ${match.winner === 1 ? teams.left.name : teams.right.name}`}
          tone="#facc15"
        >
          <StageCallout
            tone="#facc15"
            label={currentMvpVote ? "MVP registrado" : "Elegí al mejor jugador"}
            title={
              isSpectator
                ? "Votación MVP en curso"
                : currentMvpVote
                  ? `Votaste a ${getPlayerNameById(match, currentMvpVote)}`
                  : "Marcá al jugador más determinante"
            }
            description={
              isSpectator
                ? "Estás observando la elección del MVP. Sólo los jugadores del match pueden votar."
                : "No podés votarte a vos mismo. El MVP queda guardado junto al resultado final."
            }
            rightSlot={
              <div
                style={timerBadgeStyle(
                  mvpVotingSeconds != null && mvpVotingSeconds <= 20,
                )}
              >
                {mvpVotingSeconds != null
                  ? `${Math.floor(mvpVotingSeconds / 60)}:${String(mvpVotingSeconds % 60).padStart(2, "0")}`
                  : "—"}
              </div>
            }
            compact
          />

          <div
            style={{
              display: "grid",
              gridTemplateColumns: isNarrow
                ? "1fr"
                : "repeat(2, minmax(0, 1fr))",
              gap: "0.65rem",
            }}
          >
            {match.players
              .filter((player) => !player.isBot && player.userId)
              .map((player) => {
                const votes =
                  mvpVoteCounts.find(
                    (entry) => entry.nomineeUserId === player.userId,
                  )?.votes ?? 0;
                const selected = currentMvpVote === player.userId;
                const disabled =
                  !isParticipant || player.userId === currentUserId;
                return (
                  <button
                    key={player.userId}
                    type="button"
                    onClick={() => player.userId && onMvpVote(player.userId)}
                    disabled={disabled}
                    style={mvpCandidateStyle(
                      selected,
                      disabled,
                      TEAM_COLORS[player.team].accent,
                    )}
                  >
                    <AvatarCell
                      username={player.user.username}
                      avatar={player.user.avatar}
                      size={34}
                    />
                    <span style={{ minWidth: 0, textAlign: "left" }}>
                      <strong
                        style={{
                          display: "block",
                          color: selected ? "#020617" : "#e2e8f0",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {player.user.username}
                      </strong>
                      <small
                        style={{
                          color: selected
                            ? "rgba(2,6,23,0.7)"
                            : "rgba(226,232,240,0.46)",
                        }}
                      >
                        Team {player.team} · {votes} voto
                        {votes === 1 ? "" : "s"}
                        {player.userId === currentUserId ? " · vos" : ""}
                      </small>
                    </span>
                  </button>
                );
              })}
          </div>
          <ProgressRail
            label="Participación MVP"
            value={mvpVoteCounts.reduce((sum, entry) => sum + entry.votes, 0)}
            total={match.runtime?.mvpVoting?.totalPlayers ?? humanPlayersCount}
            color="#facc15"
          />
        </StageCard>
      )}

      {match.status === "VOTING" && !match.winner && (
        <StageCard
          title="Votación de ganador"
          subtitle="Votan todos los jugadores reales del test"
          tone="#c084fc"
        >
          <StageCallout
            tone="#c084fc"
            label={currentVote ? "Voto registrado" : "Decisión pendiente"}
            title={
              isSpectator
                ? "Votación de resultado en curso"
                : currentVote
                  ? `Marcaste ganador para ${currentVote === 1 ? teams.left.name : teams.right.name}`
                  : "Todavía no emitiste tu voto"
            }
            description={
              isSpectator
                ? "Estás observando el cierre competitivo. Sólo los jugadores del match pueden emitir voto."
                : "Cada voto cuenta para cerrar el match. El objetivo es validar rápido y evitar ambigüedad en el resultado."
            }
            rightSlot={
              <div
                style={timerBadgeStyle(
                  votingSeconds != null && votingSeconds <= 20,
                )}
              >
                {votingSeconds != null
                  ? `${Math.floor(votingSeconds / 60)}:${String(votingSeconds % 60).padStart(2, "0")}`
                  : "—"}
              </div>
            }
            compact
          />
          <div
            style={{
              display: "grid",
              gridTemplateColumns: isNarrow
                ? "1fr"
                : "repeat(3, minmax(0, 1fr))",
              gap: "0.65rem",
            }}
          >
            <StatusTile
              label="Mi voto"
              value={
                currentVote
                  ? currentVote === 1
                    ? teams.left.name
                    : teams.right.name
                  : "Pendiente"
              }
              tone={currentVote ? "#c084fc" : "#fbbf24"}
            />
            <StatusTile
              label="Emitidos"
              value={`${voteCounts.total}/${match.runtime?.voting?.totalPlayers ?? humanPlayersCount}`}
              tone="#7dd3fc"
            />
            <StatusTile
              label="Sin votar"
              value={`${Math.max(0, (match.runtime?.voting?.totalPlayers ?? humanPlayersCount) - voteCounts.total)}`}
              tone="#e2e8f0"
            />
          </div>
          <ProgressRail
            label="Participación de voto"
            value={voteCounts.total}
            total={match.runtime?.voting?.totalPlayers ?? humanPlayersCount}
            color="#c084fc"
          />
          {isParticipant && (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: isNarrow ? "1fr" : "1fr 1fr",
                gap: "0.75rem",
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
          )}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: isNarrow ? "1fr" : "1fr 1fr",
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
          tone={
            match.winner === 1 ? TEAM_COLORS[1].accent : TEAM_COLORS[2].accent
          }
        >
          <WinnerSummaryHero
            winnerName={match.winner === 1 ? teams.left.name : teams.right.name}
            mapName={selectedMap}
            accent={
              match.winner === 1 ? TEAM_COLORS[1].accent : TEAM_COLORS[2].accent
            }
            compact
          />
          <MatchClosureArchive
            match={match}
            teams={teams}
            mvpVoteCounts={mvpVoteCounts}
          />
          <button type="button" onClick={onBack} style={playAgainButtonStyle}>
            Volver a jugar
          </button>
        </StageCard>
      )}

      {match.status === "CANCELLED" && (
        <StageCard
          title="Match cancelado"
          subtitle="Cancelado por ambos capitanes para testing"
          tone="#fca5a5"
        >
          <StageCallout
            tone="#fca5a5"
            label="Sesión abortada"
            title="La sala se cerró antes del cierre competitivo"
            description="Se preserva el contexto del room, pero este match ya no va a aplicar resultado competitivo."
          />
          <div style={winnerBannerStyle("#fca5a5")}>
            La partida fue cancelada
          </div>
          <small style={{ color: "#94a3b8" }}>
            Volvé al dashboard y podés buscar otra partida.
          </small>
        </StageCard>
      )}
    </div>
  );

  return (
    <div style={pageShellStyle}>
      <div style={panelStyle}>
        <RoomCommandHeader
          match={match}
          selectedMap={selectedMap}
          statusMeta={statusMeta}
          teams={teams}
          allConnected={allConnected}
          canRequestCancel={canRequestCancel}
          cancelRequestedByMe={cancelRequestedByMe}
          onCancelMatch={onCancelMatch}
          onBack={onBack}
        />

        <MatchTimeline status={match.status} allConnected={allConnected} />

        {isSpectator && (
          <div style={infoBannerStyle}>
            Modo espectador activo: podés observar el matchroom completo, pero
            las acciones de jugador, chat, veto y votación están bloqueadas.
          </div>
        )}

        {cancelState &&
          cancelState.requestedBy.length > 0 &&
          match.status !== "CANCELLED" && (
            <div style={infoBannerStyle}>
              {cancelState.requestedBy.length}/{cancelState.captainIds.length}{" "}
              capitanes pidieron cancelar la partida.
            </div>
          )}

        {isMobile ? (
          <div style={{ display: "grid", gap: "0.8rem" }}>
            {centerColumn}
            <div style={mobileTeamGridStyle(isNarrow)}>
              <TeamColumn
                team={teams.left}
                teamNumber={1}
                compact={isTablet}
                completed={match.status === "COMPLETED"}
                mirrored={false}
              />
              <TeamColumn
                team={teams.right}
                teamNumber={2}
                compact={isTablet}
                completed={match.status === "COMPLETED"}
                mirrored={!isNarrow}
              />
            </div>
          </div>
        ) : (
          <div style={teamsGridStyle(isTablet)}>
            <TeamColumn
              team={teams.left}
              teamNumber={1}
              compact={isTablet}
              completed={match.status === "COMPLETED"}
              mirrored={false}
            />
            {centerColumn}
            <TeamColumn
              team={teams.right}
              teamNumber={2}
              compact={isTablet}
              completed={match.status === "COMPLETED"}
              mirrored
            />
          </div>
        )}

        <MatchTelemetryPanel
          match={match}
          selectedMap={selectedMap}
          teams={teams}
          currentUserId={currentUserId}
          uploads={match.replayUploads ?? []}
          canUpload={canUploadReplay}
          uploadState={replayUploadState}
          compact={isTablet}
          narrow={isNarrow}
          onChooseFile={() => replayInputRef.current?.click()}
        />
        <input
          ref={replayInputRef}
          type="file"
          accept=".StormReplay,.stormreplay"
          onChange={handleReplayFileChange}
          style={{ display: "none" }}
        />
      </div>
    </div>
  );
}

function RoomCommandHeader({
  match,
  selectedMap,
  statusMeta,
  teams,
  allConnected,
  canRequestCancel,
  cancelRequestedByMe,
  onCancelMatch,
  onBack,
}: {
  match: MatchState;
  selectedMap: string;
  statusMeta: ReturnType<typeof getMatchLifecycleMeta>;
  teams: {
    left: ReturnType<typeof toDisplayTeam>;
    right: ReturnType<typeof toDisplayTeam>;
  };
  allConnected: boolean;
  canRequestCancel: boolean;
  cancelRequestedByMe: boolean;
  onCancelMatch: () => void;
  onBack: () => void;
}) {
  const winnerTeam =
    match.winner === 1 || match.winner === 2 ? match.winner : null;
  const accent = winnerTeam ? TEAM_COLORS[winnerTeam].accent : statusMeta.tone;
  const mapName = selectedMap || "Mapa pendiente";
  const mapImageUrl = getMapImageUrl(mapName);
  const leftWon = winnerTeam === 1;
  const rightWon = winnerTeam === 2;
  const humanPlayersCount = match.players.filter(
    (player) => !player.isBot,
  ).length;

  return (
    <header style={commandHeaderStyle(mapImageUrl, accent)}>
      <div style={commandHeaderOverlayStyle} />
      <div style={commandHeaderToplineStyle}>
        <div style={{ display: "grid", gap: "0.35rem", minWidth: 0 }}>
          <div style={{ ...eyebrowStyle, color: accent }}>
            Nexus command room
          </div>
          <h1 style={commandTitleStyle}>MatchRoom Active</h1>
          <div style={commandSublineStyle}>
            <span style={{ color: accent, fontWeight: 950 }}>
              {statusMeta.phase}
            </span>
            <span>{statusMeta.stage ?? statusMeta.detail}</span>
            <span>·</span>
            <span>{mapName}</span>
          </div>
        </div>

        <div style={commandActionsStyle}>
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
          {match.status !== "COMPLETED" && (
            <button onClick={onBack} style={ghostButtonStyle}>
              Volver
            </button>
          )}
        </div>
      </div>

      <div style={commandVersusGridStyle}>
        <CommandTeamPlate
          team={teams.left}
          teamNumber={1}
          won={leftWon}
          completed={match.status === "COMPLETED"}
        />
        <div style={commandCenterBladeStyle(accent)}>
          <span>
            {match.status === "COMPLETED"
              ? "Match finalizado"
              : allConnected
                ? "Lobby armado"
                : "Sincronizando"}
          </span>
          <strong>VS</strong>
          <small>
            {match.status === "COMPLETED"
              ? match.duration
                ? `Duración: ${formatDuration(match.duration)}`
                : "Cierre competitivo"
              : allConnected
                ? `${humanPlayersCount} jugadores listos`
                : "Esperando confirmaciones"}
          </small>
        </div>
        <CommandTeamPlate
          team={teams.right}
          teamNumber={2}
          won={rightWon}
          completed={match.status === "COMPLETED"}
        />
      </div>
    </header>
  );
}

function CommandTeamPlate({
  team,
  teamNumber,
  won,
  completed,
}: {
  team: ReturnType<typeof toDisplayTeam>;
  teamNumber: 1 | 2;
  won: boolean;
  completed: boolean;
}) {
  const tone = TEAM_COLORS[teamNumber].accent;

  return (
    <div style={commandTeamPlateStyle(tone, won)}>
      <div style={{ display: "grid", gap: "0.18rem", minWidth: 0 }}>
        <span style={{ ...eyebrowStyle, color: tone }}>
          {teamNumber === 1 ? "Blue side" : "Red side"}
        </span>
        <strong style={commandTeamNameStyle}>{team.name}</strong>
      </div>
      <div style={commandTeamMetaStyle}>
        {completed ? (
          <span style={commandOutcomeBadgeStyle(won)}>{won ? "W" : "L"}</span>
        ) : (
          <>
            <span>{team.realPlayersCount}/5 activos</span>
            <span>{team.avgWinrate}% WR avg</span>
          </>
        )}
      </div>
    </div>
  );
}

function MatchClosureArchive({
  match,
  teams,
  mvpVoteCounts,
}: {
  match: MatchState;
  teams: {
    left: ReturnType<typeof toDisplayTeam>;
    right: ReturnType<typeof toDisplayTeam>;
  };
  mvpVoteCounts: Array<{ nomineeUserId: string; votes: number }>;
}) {
  const winnerVotes = match.votes ?? [];
  const teamOneVotes = winnerVotes.filter((vote) => vote.winner === 1).length;
  const teamTwoVotes = winnerVotes.filter((vote) => vote.winner === 2).length;
  const sortedMvpVotes = [...mvpVoteCounts]
    .filter((entry) => entry.votes > 0)
    .sort((a, b) => b.votes - a.votes);

  return (
    <div style={closureArchiveStyle}>
      <div style={closureArchiveColumnStyle}>
        <span style={{ ...eyebrowStyle, color: "#7dd3fc" }}>Vetos</span>
        <div style={closureChipWrapStyle}>
          {match.vetoes.length > 0 ? (
            [...match.vetoes]
              .sort((a, b) => a.order - b.order)
              .map((veto) => (
                <span
                  key={`${veto.order}-${veto.mapId}`}
                  style={closureChipStyle(TEAM_COLORS[veto.team].accent)}
                >
                  #{veto.order + 1} {veto.team === 1 ? teams.left.name : teams.right.name} · {veto.mapName}
                  {veto.auto ? " · auto" : ""}
                </span>
              ))
          ) : (
            <span style={closureMutedStyle}>Sin vetos registrados.</span>
          )}
        </div>
      </div>

      <div style={closureArchiveColumnStyle}>
        <span style={{ ...eyebrowStyle, color: "#c084fc" }}>Votos de ganador</span>
        <div style={closureVoteGridStyle}>
          <VotePill label={teams.left.name} votes={teamOneVotes} color={TEAM_COLORS[1].accent} />
          <VotePill label={teams.right.name} votes={teamTwoVotes} color={TEAM_COLORS[2].accent} />
        </div>
      </div>

      <div style={closureArchiveColumnStyle}>
        <span style={{ ...eyebrowStyle, color: "#facc15" }}>Votos MVP</span>
        <div style={closureChipWrapStyle}>
          {sortedMvpVotes.length > 0 ? (
            sortedMvpVotes.map((entry) => (
              <span key={entry.nomineeUserId} style={closureChipStyle("#facc15")}>
                {getPlayerNameById(match, entry.nomineeUserId)} · {entry.votes} voto{entry.votes === 1 ? "" : "s"}
              </span>
            ))
          ) : (
            <span style={closureMutedStyle}>Sin votos MVP registrados.</span>
          )}
        </div>
      </div>
    </div>
  );
}


type ReplayPlayerSummary = NonNullable<
  NonNullable<ReplayUpload["parsedSummary"]>["players"]
>[number];
type ReplayMetricKey =
  | "takedowns"
  | "kills"
  | "deaths"
  | "assists"
  | "heroDamage"
  | "siegeDamage"
  | "structureDamage"
  | "minionDamage"
  | "healing"
  | "selfHealing"
  | "damageTaken"
  | "protection"
  | "experience"
  | "mercCampCaptures"
  | "timeSpentDead"
  | "ccTime"
  | "stunTime"
  | "rootTime"
  | "silenceTime"
  | "teamfightHeroDamage"
  | "teamfightHealing"
  | "teamfightDamageTaken"
  | "gameScore"
  | "highestKillStreak";
type MatchPostTab = "overview" | "stats";

function MatchTelemetryPanel({
  match,
  selectedMap,
  teams,
  currentUserId,
  uploads,
  canUpload,
  uploadState,
  compact,
  narrow,
  onChooseFile,
}: {
  match: MatchState;
  selectedMap: string;
  teams: {
    left: ReturnType<typeof toDisplayTeam>;
    right: ReturnType<typeof toDisplayTeam>;
  };
  currentUserId: string;
  uploads: ReplayUpload[];
  canUpload: boolean;
  uploadState: {
    status: "idle" | "uploading" | "success" | "error";
    message: string | null;
  };
  compact: boolean;
  narrow: boolean;
  onChooseFile: () => void;
}) {
  const latest = uploads[0] ?? null;
  const parsedPlayers = sortReplayPlayers(latest?.parsedSummary?.players ?? []);
  const hasReplayStats = parsedPlayers.length > 0;
  const [activeTab, setActiveTab] = useState<MatchPostTab>("overview");
  const validation = latest?.parsedSummary?.validation;
  const resolution = latest?.parsedSummary?.resolution;
  const replayMatch = latest?.parsedSummary?.match;
  const trustScore = validation?.trustScore ?? resolution?.trustScore ?? null;
  const identityConfidence =
    validation?.identityConfidence ?? resolution?.identityConfidence ?? null;
  const replayWarnings =
    validation?.issues ?? latest?.parsedSummary?.warnings ?? [];
  const mapName = latest?.parsedMap ?? replayMatch?.map ?? selectedMap;
  const mapImageUrl = getMapImageUrl(mapName);
  const winnerTeam =
    match.winner ?? latest?.parsedWinnerTeam ?? replayMatch?.winnerTeam ?? null;
  const winnerName = getTeamDisplayName(teams, winnerTeam);
  const duration =
    latest?.parsedDuration ?? replayMatch?.duration ?? match.duration ?? null;
  const statusTone = getReplayUploadStatusTone(latest?.status);
  const resolutionTone = getReplayResolutionTone(resolution?.status);
  const topDamage = getTopReplayPlayer(parsedPlayers, "heroDamage");
  const topSiege = getTopReplayPlayer(parsedPlayers, "siegeDamage");
  const topHealing = getTopReplayPlayer(parsedPlayers, "healing");
  const topXp = getTopReplayPlayer(parsedPlayers, "experience");
  const topTank = getTopReplayPlayer(parsedPlayers, "damageTaken");
  const topCc = getTopReplayPlayer(parsedPlayers, "ccTime");
  const topMercs = getTopReplayPlayer(parsedPlayers, "mercCampCaptures");
  const matchMvpPlayer = getReplayPlayerForMatchUser(
    parsedPlayers,
    match.players,
    match.mvpUserId ?? null,
  );
  const totalHeroDamage = sumReplayMetric(parsedPlayers, "heroDamage");
  const totalSiegeDamage = sumReplayMetric(parsedPlayers, "siegeDamage");
  const totalHealing = sumReplayMetric(parsedPlayers, "healing");
  const totalExperience = sumReplayMetric(parsedPlayers, "experience");
  const totalTakedowns = sumReplayMetric(parsedPlayers, "takedowns");
  const totalMercs = sumReplayMetric(parsedPlayers, "mercCampCaptures");
  const teamOneTotals = getTeamReplayTotals(parsedPlayers, 1);
  const teamTwoTotals = getTeamReplayTotals(parsedPlayers, 2);
  const maxValues = {
    heroDamage: Math.max(
      1,
      ...parsedPlayers.map((player) =>
        getReplayMetricValue(player, "heroDamage"),
      ),
    ),
    siegeDamage: Math.max(
      1,
      ...parsedPlayers.map((player) =>
        getReplayMetricValue(player, "siegeDamage"),
      ),
    ),
    healing: Math.max(
      1,
      ...parsedPlayers.map((player) => getReplayMetricValue(player, "healing")),
    ),
    experience: Math.max(
      1,
      ...parsedPlayers.map((player) =>
        getReplayMetricValue(player, "experience"),
      ),
    ),
  };

  useEffect(() => {
    if (!hasReplayStats && activeTab !== "overview") {
      setActiveTab("overview");
    }
  }, [activeTab, hasReplayStats]);

  return (
    <section style={telemetryPanelStyle(mapImageUrl)}>
      <div style={telemetryPanelVeilStyle} />
      <div style={telemetryHeaderStyle}>
        <div style={{ display: "grid", gap: "0.35rem", minWidth: 0 }}>
          <div style={{ ...eyebrowStyle, color: "#7dd3fc" }}>
            StormReplay telemetry
          </div>
          <h2 style={telemetryTitleStyle}>Post-partida</h2>
          <p style={telemetryDescriptionStyle}>
            Resumen competitivo, validación de StormReplay y tablero estadístico
            cuando el archivo ya fue procesado.
          </p>
        </div>

        <button
          type="button"
          onClick={onChooseFile}
          disabled={!canUpload || uploadState.status === "uploading"}
          style={telemetryUploadButtonStyle(
            !canUpload || uploadState.status === "uploading",
          )}
        >
          {uploadState.status === "uploading"
            ? "Procesando replay…"
            : latest
              ? "Subir otra StormReplay"
              : "Subir StormReplay"}
        </button>
      </div>

      {uploadState.message && (
        <div style={replayUploadNoticeStyle(uploadState.status === "error")}>
          {uploadState.message}
        </div>
      )}

      {resolution?.message && (
        <div
          style={{
            ...telemetryNoticeStyle(resolutionTone),
            background:
              resolution?.status === "winner_mismatch"
                ? "rgba(127, 29, 29, 0.24)"
                : "rgba(8, 18, 32, 0.72)",
          }}
        >
          {resolution.message}
        </div>
      )}

      {replayWarnings.length > 0 && (
        <div style={telemetryNoticeStyle("#fbbf24")}>
          Confianza replay: {formatReplayTrust(identityConfidence, trustScore)} ·{" "}
          {formatReplayWarnings(replayWarnings)}
        </div>
      )}

      {latest && (
        <div style={telemetryUploadMetaStyle}>
          <span>Archivo: {latest.originalName}</span>
          <span>{formatBytes(latest.fileSize)}</span>
          <span>Subido por {latest.uploadedBy?.username ?? "Usuario"}</span>
          <span>
            {latest.sha256
              ? `SHA ${latest.sha256.slice(0, 10)}…`
              : "Hash pendiente"}
          </span>
        </div>
      )}

      {hasReplayStats && (
        <MatchPostTabs activeTab={activeTab} onChange={setActiveTab} />
      )}

      {activeTab === "overview" ? (
        <>
          <div style={telemetryResultGridStyle(compact)}>
            <div style={telemetryResultBladeStyle(winnerTeam, mapImageUrl)}>
              <span style={telemetryMicroLabelStyle}>Resultado oficial</span>
              <strong style={telemetryWinnerStyle(winnerTeam)}>
                {winnerTeam ? `Ganó ${winnerName}` : "Resultado pendiente"}
              </strong>
              <div style={telemetryResultMetaStyle}>
                <span>{mapName}</span>
                <span>·</span>
                <span>
                  {duration ? formatDuration(duration) : "Duración pendiente"}
                </span>
              </div>
            </div>

            <div style={telemetryKpiGridStyle(narrow)}>
              <TelemetryKpi
                label="Parser"
                value={latest?.parserStatus ?? latest?.status ?? "Sin replay"}
                tone={statusTone}
              />
              <TelemetryKpi
                label="Modo"
                value={latest?.parsedGameMode ?? replayMatch?.gameMode ?? "—"}
                tone="#7dd3fc"
              />
              <TelemetryKpi
                label="Jugadores"
                value={
                  typeof validation?.matchedPlayers === "number"
                    ? `${validation.matchedPlayers}/${validation.expectedHumanPlayers ?? "?"}`
                    : hasReplayStats
                      ? `${parsedPlayers.length}/10`
                      : "—"
                }
                tone={
                  validation?.matchedPlayers ===
                  validation?.expectedHumanPlayers
                    ? "#4ade80"
                    : "#fbbf24"
                }
              />
              <TelemetryKpi
                label="Confianza"
                value={formatReplayTrust(identityConfidence, trustScore)}
                tone={getReplayTrustTone(identityConfidence, trustScore)}
              />
              <TelemetryKpi
                label="Resolución"
                value={getReplayResolutionLabel(resolution?.status)}
                tone={resolutionTone}
              />
              <TelemetryKpi
                label="Build"
                value={formatNullableNumber(
                  latest?.parsedBuild ?? replayMatch?.build,
                )}
                tone="#c084fc"
              />
              <TelemetryKpi
                label="Fecha"
                value={formatReplayDate(
                  latest?.parsedGameDate ?? replayMatch?.gameDate,
                )}
                tone="#e2e8f0"
              />
            </div>
          </div>

          {!hasReplayStats && (
            <div style={telemetryEmptyStateStyle}>
              <div
                style={{
                  ...eyebrowStyle,
                  color: latest?.status === "FAILED" ? "#fca5a5" : "#7dd3fc",
                }}
              >
                {latest?.status === "FAILED"
                  ? "Replay no parseado"
                  : "Esperando datos de combate"}
              </div>
              <strong>
                {latest?.status === "FAILED"
                  ? "El parser no pudo leer esta StormReplay"
                  : "Subí la StormReplay para abrir el tablero estadístico"}
              </strong>
              <p>
                {latest?.status === "FAILED"
                  ? (latest.parseError ??
                    "El archivo quedó guardado, pero no hay stats disponibles todavía.")
                  : "Cuando el replay esté procesado, se habilitará la pestaña Estadísticas con héroes, KDA, daño, healing, XP y derribos por jugador."}
              </p>
            </div>
          )}
        </>
      ) : (
        <>
          <ReplayReportHighlights
            mvp={matchMvpPlayer}
            topDamage={topDamage}
            topSiege={topSiege}
            topHealing={topHealing}
            topXp={topXp}
            topTank={topTank}
            topCc={topCc}
            topMercs={topMercs}
          />

          <div style={combatKpiGridStyle(narrow)}>
            <TelemetryKpi
              label="Derribos"
              value={formatReplayNumber(totalTakedowns)}
              tone="#facc15"
              large
            />
            <TelemetryKpi
              label="Hero damage"
              value={formatReplayNumber(totalHeroDamage)}
              tone="#38bdf8"
              large
            />
            <TelemetryKpi
              label="Siege damage"
              value={formatReplayNumber(totalSiegeDamage)}
              tone="#fb7185"
              large
            />
            <TelemetryKpi
              label="Healing"
              value={formatReplayNumber(totalHealing)}
              tone="#4ade80"
              large
            />
            <TelemetryKpi
              label="XP total"
              value={formatReplayNumber(totalExperience)}
              tone="#f59e0b"
              large
            />
            <TelemetryKpi
              label="Top daño"
              value={topDamage ? getReplayPlayerShortName(topDamage) : "—"}
              tone="#38bdf8"
            />
            <TelemetryKpi
              label="Merc camps"
              value={formatReplayNumber(totalMercs)}
              tone="#a78bfa"
            />
            <TelemetryKpi
              label="Top heal/soak"
              value={
                topHealing
                  ? getReplayPlayerShortName(topHealing)
                  : topXp
                    ? getReplayPlayerShortName(topXp)
                    : "—"
              }
              tone="#4ade80"
            />
          </div>

          <ReplayTeamStatsBoard
            matchPlayers={match.players}
            replayPlayers={parsedPlayers}
            teams={teams}
            winnerTeam={winnerTeam}
            currentUserId={currentUserId}
            maxValues={maxValues}
            teamOneTotals={teamOneTotals}
            teamTwoTotals={teamTwoTotals}
          />
        </>
      )}
    </section>
  );
}

function MatchPostTabs({
  activeTab,
  onChange,
}: {
  activeTab: MatchPostTab;
  onChange: (tab: MatchPostTab) => void;
}) {
  const tabs: Array<{ key: MatchPostTab; label: string; badge?: string }> = [
    { key: "overview", label: "Descripción general" },
    { key: "stats", label: "Estadísticas", badge: "Replay" },
  ];

  return (
    <div style={matchPostTabsStyle}>
      {tabs.map((tab) => {
        const active = activeTab === tab.key;
        return (
          <button
            key={tab.key}
            type="button"
            onClick={() => onChange(tab.key)}
            style={matchPostTabButtonStyle(active)}
          >
            <span>{tab.label}</span>
            {tab.badge && (
              <span style={matchPostTabBadgeStyle}>{tab.badge}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

function TelemetryKpi({
  label,
  value,
  tone,
  large = false,
}: {
  label: string;
  value: string;
  tone: string;
  large?: boolean;
}) {
  return (
    <div style={telemetryKpiStyle(tone, large)}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function ReplayReportHighlights({
  mvp,
  topDamage,
  topSiege,
  topHealing,
  topXp,
  topTank,
  topCc,
  topMercs,
}: {
  mvp: ReplayPlayerSummary | null;
  topDamage: ReplayPlayerSummary | null;
  topSiege: ReplayPlayerSummary | null;
  topHealing: ReplayPlayerSummary | null;
  topXp: ReplayPlayerSummary | null;
  topTank: ReplayPlayerSummary | null;
  topCc: ReplayPlayerSummary | null;
  topMercs: ReplayPlayerSummary | null;
}) {
  const cards = [
    {
      label: "MVP votado",
      player: mvp,
      value: mvp?.hero ?? "Sin MVP",
      tone: "#facc15",
      metric: null,
      fallback: "Se completa al cerrar la votación",
    },
    {
      label: "Artillero",
      player: topDamage,
      value: formatReplayNumber(topDamage?.heroDamage),
      tone: "#38bdf8",
      metric: "Hero damage",
      fallback: "—",
    },
    {
      label: "Siege breaker",
      player: topSiege,
      value: formatReplayNumber(topSiege?.siegeDamage),
      tone: "#fb7185",
      metric: "Siege damage",
      fallback: "—",
    },
    {
      label: "Soporte clave",
      player: topHealing ?? topXp,
      value: topHealing
        ? formatReplayNumber(topHealing.healing)
        : formatReplayNumber(topXp?.experience),
      tone: "#4ade80",
      metric: topHealing ? "Healing" : "XP",
      fallback: "—",
    },
    {
      label: "Frontline",
      player: topTank,
      value: formatReplayNumber(topTank?.damageTaken),
      tone: "#c084fc",
      metric: "Daño recibido",
      fallback: "—",
    },
    {
      label: "Control",
      player: topCc,
      value: formatDuration(topCc?.ccTime ?? 0),
      tone: "#22d3ee",
      metric: "CC time",
      fallback: "—",
    },
    {
      label: "Macro",
      player: topMercs,
      value: formatReplayNumber(topMercs?.mercCampCaptures),
      tone: "#a78bfa",
      metric: "Merc camps",
      fallback: "—",
    },
  ];

  return (
    <div style={replayHighlightsGridStyle}>
      {cards.map((card) => (
        <article key={card.label} style={replayHighlightCardStyle(card.tone)}>
          <div style={{ ...eyebrowStyle, color: card.tone }}>{card.label}</div>
          <strong>{card.player ? getReplayPlayerShortName(card.player) : card.fallback}</strong>
          <span>
            {card.player
              ? `${card.value}${card.metric ? ` · ${card.metric}` : ""}`
              : card.value}
          </span>
        </article>
      ))}
    </div>
  );
}

function ReplayTeamStatsBoard({
  matchPlayers,
  replayPlayers,
  teams,
  winnerTeam,
  currentUserId,
  maxValues,
  teamOneTotals,
  teamTwoTotals,
}: {
  matchPlayers: Player[];
  replayPlayers: ReplayPlayerSummary[];
  teams: {
    left: ReturnType<typeof toDisplayTeam>;
    right: ReturnType<typeof toDisplayTeam>;
  };
  winnerTeam: 1 | 2 | null;
  currentUserId: string;
  maxValues: {
    heroDamage: number;
    siegeDamage: number;
    healing: number;
    experience: number;
  };
  teamOneTotals: ReturnType<typeof getTeamReplayTotals>;
  teamTwoTotals: ReturnType<typeof getTeamReplayTotals>;
}) {
  return (
    <div style={replayTeamBoardStyle}>
      <ReplayTeamStatsLane
        team={teams.left}
        teamNumber={1}
        totals={teamOneTotals}
        winnerTeam={winnerTeam}
        players={replayPlayers.filter((player) => player.team === 1)}
        matchPlayers={matchPlayers}
        currentUserId={currentUserId}
        maxValues={maxValues}
      />
      <div style={replayTeamDividerStyle} />
      <ReplayTeamStatsLane
        team={teams.right}
        teamNumber={2}
        totals={teamTwoTotals}
        winnerTeam={winnerTeam}
        players={replayPlayers.filter((player) => player.team === 2)}
        matchPlayers={matchPlayers}
        currentUserId={currentUserId}
        maxValues={maxValues}
      />
    </div>
  );
}

function ReplayTeamStatsLane({
  team,
  teamNumber,
  totals,
  winnerTeam,
  players,
  matchPlayers,
  currentUserId,
  maxValues,
}: {
  team: ReturnType<typeof toDisplayTeam>;
  teamNumber: 1 | 2;
  totals: ReturnType<typeof getTeamReplayTotals>;
  winnerTeam: 1 | 2 | null;
  players: ReplayPlayerSummary[];
  matchPlayers: Player[];
  currentUserId: string;
  maxValues: {
    heroDamage: number;
    siegeDamage: number;
    healing: number;
    experience: number;
  };
}) {
  const tone = TEAM_COLORS[teamNumber].accent;
  const won = winnerTeam === teamNumber;

  return (
    <section style={replayTeamLaneStyle(tone, won)}>
      <div style={replayTeamLaneHeaderStyle}>
        <div>
          <div style={{ ...eyebrowStyle, color: tone }}>
            {teamNumber === 1 ? "Blue telemetry" : "Red telemetry"}
          </div>
          <strong>{team.name}</strong>
        </div>
        <span style={teamTelemetryResultStyle(won)}>
          {won ? "Victoria" : winnerTeam ? "Derrota" : "Pendiente"}
        </span>
      </div>
      <div style={teamTelemetryStatsStyle}>
        <TelemetryMiniStat
          label="Derribos"
          value={formatReplayNumber(totals.takedowns)}
          tone="#facc15"
        />
        <TelemetryMiniStat
          label="K/D/A"
          value={`${formatReplayNumber(totals.kills)}/${formatReplayNumber(totals.deaths)}/${formatReplayNumber(totals.assists)}`}
          tone="#e2e8f0"
        />
        <TelemetryMiniStat
          label="Hero dmg"
          value={formatReplayNumber(totals.heroDamage)}
          tone="#38bdf8"
        />
        <TelemetryMiniStat
          label="Siege"
          value={formatReplayNumber(totals.siegeDamage)}
          tone="#fb7185"
        />
        <TelemetryMiniStat
          label="Healing"
          value={formatReplayNumber(totals.healing)}
          tone="#4ade80"
        />
        <TelemetryMiniStat
          label="XP"
          value={formatReplayNumber(totals.experience)}
          tone="#f59e0b"
        />
        <TelemetryMiniStat
          label="Mercs"
          value={formatReplayNumber(totals.mercCampCaptures)}
          tone="#a78bfa"
        />
        <TelemetryMiniStat
          label="Daño recibido"
          value={formatReplayNumber(totals.damageTaken)}
          tone="#c084fc"
        />
        <TelemetryMiniStat
          label="Tiempo muerto"
          value={formatDuration(totals.timeSpentDead)}
          tone="#f87171"
        />
        <TelemetryMiniStat
          label="CC"
          value={formatDuration(totals.ccTime)}
          tone="#22d3ee"
        />
      </div>

      <div style={replayPlayerTableScrollStyle}>
        <div style={replayPlayerTableStyle}>
          <div style={replayPlayerHeaderRowStyle}>
            <span>Jugador</span>
            <span>Héroe</span>
            <span>K/D/A</span>
            <span>Derribos</span>
            <span>Hero dmg</span>
            <span>Siege</span>
            <span>Healing</span>
            <span>XP</span>
          </div>

          {players.map((player, index) => {
            const matchPlayer = findMatchPlayerForReplay(matchPlayers, player);
            return (
              <ReplayPlayerStatRow
                key={`${teamNumber}-${player.name}-${player.hero ?? "hero"}-${index}`}
                player={player}
                matchPlayer={matchPlayer}
                isCurrentUser={Boolean(
                  matchPlayer?.userId && matchPlayer.userId === currentUserId,
                )}
                tone={tone}
                maxValues={maxValues}
              />
            );
          })}
        </div>
      </div>
    </section>
  );
}

function TelemetryMiniStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: string;
}) {
  return (
    <div style={telemetryMiniStatStyle(tone)}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function ReplayPlayerStatRow({
  player,
  matchPlayer,
  isCurrentUser,
  tone,
  maxValues,
}: {
  player: ReplayPlayerSummary;
  matchPlayer: Player | null;
  isCurrentUser: boolean;
  tone: string;
  maxValues: {
    heroDamage: number;
    siegeDamage: number;
    healing: number;
    experience: number;
  };
}) {
  const displayName =
    matchPlayer?.user.username ?? player.battleTag ?? player.name;
  const subtitle =
    player.battleTag && player.battleTag !== displayName
      ? player.battleTag
      : player.name;
  const kda = `${formatReplayNumber(player.kills)}/${formatReplayNumber(player.deaths)}/${formatReplayNumber(player.assists)}`;
  const hero = findReplayHeroByName(player.hero);

  return (
    <div style={replayPlayerRowStyle(tone, player.won, isCurrentUser)}>
      <div style={replayPlayerIdentityCellStyle}>
        <ReplayHeroPortrait hero={hero} fallbackName={player.hero} tone={tone} won={player.won} />
        <div style={{ minWidth: 0 }}>
          <div style={playerDossierNameRowStyle}>
            <strong>{displayName}</strong>
            {isCurrentUser && <span style={currentUserTagStyle}>Vos</span>}
          </div>
          <span style={playerDossierSubStyle}>{subtitle}</span>
        </div>
      </div>
      <div style={replayPlayerHeroCellStyle}>
        <span>{player.hero ?? "—"}</span>
        <small>
          {formatReplayPlayerLoadout(player)}
        </small>
      </div>
      <div style={replayPlayerMetricValueStyle}>{kda}</div>
      <div style={replayPlayerMetricValueStyle}>
        {formatReplayNumber(player.takedowns)}
      </div>
      <ReplayInlineMetric
        value={getReplayMetricValue(player, "heroDamage")}
        max={maxValues.heroDamage}
        tone="#38bdf8"
      />
      <ReplayInlineMetric
        value={getReplayMetricValue(player, "siegeDamage")}
        max={maxValues.siegeDamage}
        tone="#fb7185"
      />
      <ReplayInlineMetric
        value={getReplayMetricValue(player, "healing")}
        max={maxValues.healing}
        tone="#4ade80"
      />
      <ReplayInlineMetric
        value={getReplayMetricValue(player, "experience")}
        max={maxValues.experience}
        tone="#f59e0b"
      />
    </div>
  );
}

function ReplayHeroPortrait({
  hero,
  fallbackName,
  tone,
  won,
}: {
  hero: HotsHero | null;
  fallbackName: string | null | undefined;
  tone: string;
  won: boolean;
}) {
  const [srcIndex, setSrcIndex] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const sources = hero ? getHeroImageSources(hero) : [];
  const src = sources[srcIndex];
  const fallback = (hero?.name ?? fallbackName ?? "??").slice(0, 2).toUpperCase();

  return (
    <div style={heroEmblemStyle(tone, won, Boolean(src))}>
      {src ? (
        <img
          src={src}
          alt={hero?.name ?? fallbackName ?? "Héroe"}
          loading="lazy"
          decoding="async"
          style={{
            ...replayHeroPortraitImageStyle,
            opacity: loaded ? 0.92 : 0,
          }}
          onLoad={() => setLoaded(true)}
          onError={() => {
            setLoaded(false);
            setSrcIndex((current) => current + 1);
          }}
        />
      ) : null}
      {!loaded && <span style={replayHeroFallbackStyle}>{fallback}</span>}
    </div>
  );
}

function ReplayInlineMetric({
  value,
  max,
  tone,
}: {
  value: number;
  max: number;
  tone: string;
}) {
  const width = Math.max(4, Math.min(100, (value / Math.max(1, max)) * 100));

  return (
    <div style={replayInlineMetricStyle}>
      <strong>{formatReplayNumber(value)}</strong>
      <span style={replayInlineMetricTrackStyle}>
        <span style={replayInlineMetricFillStyle(width, tone)} />
      </span>
    </div>
  );
}

function MatchOpsStrip({
  statusMeta,
  selectedMap,
  allConnected,
  readyCount,
  totalReadyPlayers,
  presenceKnown,
  onlineHumanCount,
  humanPlayersCount,
  presenceUpdatedAt,
  hasOfflinePlayers,
  offlinePlayerNames,
  vetoTurnLabel,
  vetoSeconds,
  voteCount,
  voteTotal,
  mvpVoteCount,
  mvpVoteTotal,
  finishApprovals,
  finishNeeded,
}: {
  statusMeta: ReturnType<typeof getMatchLifecycleMeta>;
  selectedMap: string;
  allConnected: boolean;
  readyCount: number;
  totalReadyPlayers: number;
  presenceKnown: boolean;
  onlineHumanCount: number;
  humanPlayersCount: number;
  presenceUpdatedAt: number | null;
  hasOfflinePlayers: boolean;
  offlinePlayerNames: string[];
  vetoTurnLabel: string | null;
  vetoSeconds: number | null;
  voteCount: number;
  voteTotal: number;
  mvpVoteCount: number;
  mvpVoteTotal: number;
  finishApprovals: number;
  finishNeeded: number;
}) {
  const tone = hasOfflinePlayers ? "#fbbf24" : statusMeta.tone;
  const stageLabel =
    statusMeta.stage === "Veto"
      ? vetoTurnLabel
        ? `Turno · ${vetoTurnLabel}`
        : "Turno pendiente"
      : statusMeta.stage === "Conectando" || statusMeta.stage === "Cierre"
        ? allConnected
          ? `Cierre capitanes ${finishApprovals}/${finishNeeded}`
          : `Lobby ${readyCount}/${totalReadyPlayers}`
        : statusMeta.stage === "Votación"
          ? `Votos ${voteCount}/${voteTotal}`
          : statusMeta.detail;
  const pulseLabel =
    statusMeta.stage === "Veto" && vetoSeconds != null
      ? `00:${String(vetoSeconds).padStart(2, "0")}`
      : statusMeta.stage === "Votación"
        ? `${mvpVoteCount}/${mvpVoteTotal} MVP`
        : presenceKnown
          ? `${onlineHumanCount}/${humanPlayersCount} online`
          : "Live";

  return (
    <section style={opsStripStyle(tone, hasOfflinePlayers)}>
      <div style={opsStripMainStyle}>
        <span style={{ ...eyebrowStyle, color: tone }}>Estado táctico</span>
        <strong>{statusMeta.stage ?? statusMeta.phase}</strong>
        <small>{stageLabel}</small>
      </div>
      <div style={opsStripMetaStyle}>
        <span style={opsPillStyle("#7dd3fc")}>{selectedMap || "Mapa pendiente"}</span>
        <span style={opsPillStyle(tone)}>{pulseLabel}</span>
        {presenceKnown && (
          <span style={opsPillStyle(hasOfflinePlayers ? "#fbbf24" : "#4ade80")}>
            Señal {formatPresenceUpdatedAt(presenceUpdatedAt)}
          </span>
        )}
      </div>
      {hasOfflinePlayers && (
        <div style={opsOfflineStyle}>
          Reconexión pendiente · {offlinePlayerNames.join(", ")}
        </div>
      )}
    </section>
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

function TeamColumn({
  team,
  teamNumber,
  compact = false,
  completed = false,
  mirrored = false,
}: {
  team: ReturnType<typeof toDisplayTeam>;
  teamNumber: 1 | 2;
  compact?: boolean;
  completed?: boolean;
  mirrored?: boolean;
}) {
  const colors = TEAM_COLORS[teamNumber];
  const teamWon = team.players.some((player) => player.isWinner);
  const activePlayers = team.players.filter((player) => !player.placeholder);
  const totalMvpVotes = activePlayers.reduce(
    (sum, player) => sum + (player.mvpVotes ?? 0),
    0,
  );

  return (
    <section
      style={{
        ...teamColumnStyle,
        borderColor: colors.border,
        backgroundImage:
          teamNumber === 1
            ? `linear-gradient(145deg, rgba(0,28,42,0.88), rgba(4,9,18,0.92) 42%, rgba(4,9,18,0.78)), radial-gradient(circle at 88% 10%, ${colors.accent}2c, transparent 28%), url(${TEAM_BACKDROPS[teamNumber]})`
            : `linear-gradient(215deg, rgba(42,8,24,0.88), rgba(12,6,18,0.92) 42%, rgba(4,9,18,0.78)), radial-gradient(circle at 12% 10%, ${colors.accent}2c, transparent 28%), url(${TEAM_BACKDROPS[teamNumber]})`,
        backgroundSize: "cover",
        backgroundPosition: teamNumber === 1 ? "center left" : "center right",
      }}
    >
      <div style={teamHeaderStyle(mirrored)}>
        <div style={{ minWidth: 0, textAlign: mirrored ? "right" : "left" }}>
          <div style={{ ...eyebrowStyle, color: colors.accent }}>
            {teamNumber === 1 ? "Blue side" : "Red side"}
          </div>
          <div style={teamTitleStyle}>{team.name}</div>
          <div style={teamCaptainLineStyle(mirrored)}>
            Capitán · <strong>{team.captainName}</strong>
          </div>
        </div>
        <div style={teamSummaryStackStyle(mirrored)}>
          {completed ? (
            <span style={teamPanelOutcomeBadgeStyle(teamWon)}>
              {teamWon ? "W" : "L"}
            </span>
          ) : (
            <>
              <MetaChip label="Activos" value={`${team.realPlayersCount}/5`} />
              <MetaChip label="WR avg" value={`${team.avgWinrate}%`} />
            </>
          )}
          {totalMvpVotes > 0 && (
            <MetaChip label="MVP votos" value={String(totalMvpVotes)} />
          )}
        </div>
      </div>

      <div style={teamRosterStyle}>
        {team.players.map((player, index) => (
          <TeamPlayerCard
            key={player.id}
            player={player}
            index={index}
            accent={colors.accent}
            compact={compact}
            mirrored={mirrored}
            completed={completed}
            teamStatus={team.status}
          />
        ))}
      </div>
    </section>
  );
}

function TeamPlayerCard({
  player,
  index,
  accent,
  compact,
  mirrored,
  completed,
  teamStatus,
}: {
  player: ReturnType<typeof toDisplayTeam>["players"][number];
  index: number;
  accent: string;
  compact: boolean;
  mirrored: boolean;
  completed: boolean;
  teamStatus: MatchStatus;
}) {
  const hasMvpVotes = (player.mvpVotes ?? 0) > 0;
  const formWins = player.recentMatches.filter((match) => match.won).length;
  const formTotal = player.recentMatches.length;
  const formLabel = formTotal > 0 ? `${formWins}/${formTotal}` : "sin data";
  const mmrLabel = player.mmrBefore > 0 ? `${player.mmrBefore} MMR` : "MMR —";

  return (
    <article
      style={playerDuelCardStyle({
        placeholder: player.placeholder,
        captain: player.isCaptain,
        mvp: player.isMvp,
        mirrored,
        accent,
        slot: index,
      })}
    >
      <div style={playerIdentityBlockStyle(mirrored)}>
        <div style={playerAvatarFrameStyle(accent, player.isMvp)}>
          <AvatarCell
            username={player.name}
            avatar={player.avatar}
            size={compact ? 42 : 52}
          />
          {!player.placeholder && (
            <>
              <span style={playerSlotBadgeStyle(mirrored, accent)}>{index + 1}</span>
              <div style={playerRankBadgeDockStyle}>
                <LevelBadge level={player.level} />
              </div>
            </>
          )}
        </div>

        <div style={playerNameStackStyle(mirrored)}>
          <div style={playerNameRowStyle(mirrored)}>
            <span title="Nacionalidad">{getCountryFlag(player.countryCode)}</span>
            <span style={playerNameStyle}>{player.name}</span>
          </div>
          <div style={playerRoleTagRowStyle(mirrored)}>
            {player.isCaptain && (
              <span style={captainMiniTagStyle(accent)}>CAPITÁN</span>
            )}
            {player.isMvp && <span style={mvpMiniTagStyle}>MVP</span>}
            {player.isOnline != null && (
              <span style={presenceMiniTagStyle(player.isOnline)}>
                {player.isOnline ? "ONLINE" : "OFFLINE"}
              </span>
            )}
            {player.placeholder && <span style={botTagStyle}>BOT</span>}
          </div>
        </div>
      </div>

      <div style={playerDuelBodyStyle(mirrored)}>
        {player.placeholder ? (
          <div style={playerSublineStyle(mirrored)}>Bot de testing</div>
        ) : (
          <>
            <div style={playerStatSentenceStyle(mirrored)}>
              <span>{mmrLabel}</span>
              <span>·</span>
              <strong style={{ color: player.winrate >= 50 ? "#4ade80" : "#f87171" }}>
                {player.winrate}% WR
              </strong>
              <span>·</span>
              <span>{player.wins}W / {player.losses}L</span>
            </div>

            <div style={playerDuelFooterStyle(mirrored)}>
              <span style={recentFormLabelStyle}>Forma {formLabel}</span>
              <RecentForm matches={player.recentMatches} />
              {hasMvpVotes && (
                <span style={mvpVoteSlimTagStyle}>
                  MVP · {player.mvpVotes} voto{player.mvpVotes === 1 ? "" : "s"}
                </span>
              )}
              {completed && typeof player.mmrDelta === "number" ? (
                <span style={mmrDeltaBadgeStyle(player.mmrDelta)}>
                  {player.mmrDelta >= 0 ? "+" : ""}
                  {player.mmrDelta} ELO
                </span>
              ) : teamStatus === "COMPLETED" && player.isWinner ? (
                <span style={winnerMiniTagStyle}>VICTORIA</span>
              ) : null}
            </div>
          </>
        )}
      </div>
    </article>
  );
}

function RecentForm({
  matches,
}: {
  matches: Array<{ won: boolean; map: string | null; date: string }>;
}) {
  const form = matches.slice(0, 5);
  const padded = [...form];
  while (padded.length < 5) {
    padded.push({ won: false, map: null, date: "" });
  }

  return (
    <span style={recentFormStyle}>
      {padded.map((match, index) => {
        const hasResult = index < form.length;
        const color = !hasResult
          ? "rgba(148,163,184,0.22)"
          : match.won
            ? "#4ade80"
            : "#f87171";
        return (
          <span
            key={`${match.date || "empty"}-${index}`}
            title={
              hasResult
                ? `${match.won ? "Victoria" : "Derrota"}${match.map ? ` · ${match.map}` : ""}`
                : "Sin partida"
            }
            style={{
              width: "13px",
              height: "13px",
              display: "grid",
              placeItems: "center",
              border: `1px solid ${color}88`,
              background: hasResult ? `${color}22` : "rgba(15,23,42,0.7)",
              color,
              fontSize: "0.48rem",
              fontWeight: 900,
              lineHeight: 1,
            }}
          >
            {hasResult ? (match.won ? "W" : "L") : "·"}
          </span>
        );
      })}
    </span>
  );
}

function LevelBadge({ level }: { level: number }) {
  return (
    <div title={`Rango ${level}`} style={{ flexShrink: 0 }}>
      <RankBadge
        level={level}
        size="sm"
        showLabel={false}
        showMmr={false}
        glow="soft"
      />
    </div>
  );
}

function MetaChip({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        display: "grid",
        gap: "0.1rem",
        padding: "0.35rem 0.5rem",
        minWidth: "72px",
        border: "1px solid rgba(148,163,184,0.14)",
        background: "rgba(255,255,255,0.025)",
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.03)",
      }}
    >
      <div
        style={{
          color: "#64748b",
          fontSize: "0.56rem",
          fontWeight: 800,
          letterSpacing: "0.16em",
          textTransform: "uppercase",
        }}
      >
        {label}
      </div>
      <div
        style={{
          color: "#e2e8f0",
          fontFamily: "var(--font-display)",
          fontSize: "0.78rem",
          letterSpacing: "0.06em",
        }}
      >
        {value}
      </div>
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
  tone,
  children,
}: {
  title: string;
  subtitle: string;
  tone?: string;
  children: ReactNode;
}) {
  return (
    <div
      style={{
        ...stageCardStyle,
        borderColor: tone ? `${tone}2e` : stageCardStyle.borderColor,
        boxShadow: tone
          ? `inset 0 1px 0 rgba(255,255,255,0.03), 0 0 28px ${tone}10`
          : undefined,
      }}
    >
      <div>
        <div style={{ ...eyebrowStyle, color: tone ?? eyebrowStyle.color }}>
          {title}
        </div>
        <div style={{ color: "#e2e8f0", fontWeight: 700, fontSize: "0.84rem" }}>
          {subtitle}
        </div>
      </div>
      <div style={{ display: "grid", gap: "0.66rem" }}>{children}</div>
    </div>
  );
}

function StageCallout({
  tone,
  label,
  title,
  description,
  rightSlot,
  compact = false,
}: {
  tone: string;
  label: string;
  title: string;
  description: string;
  rightSlot?: ReactNode;
  compact?: boolean;
}) {
  return (
    <div
      style={{
        position: "relative",
        overflow: "hidden",
        border: `1px solid ${tone}36`,
        background: `linear-gradient(135deg, ${tone}18, rgba(15,23,42,0.78))`,
        padding: compact ? "0.72rem 0.8rem" : "0.95rem 1rem",
        display: "grid",
        gap: "0.35rem",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: "auto 18% -14px",
          height: "54px",
          background: `radial-gradient(circle at 50% 100%, ${tone}28, transparent 72%)`,
          pointerEvents: "none",
          filter: "blur(10px)",
        }}
      />
      <div
        style={{
          display: "flex",
          alignItems: "start",
          justifyContent: "space-between",
          gap: "0.75rem",
          flexWrap: "wrap",
        }}
      >
        <div
          style={{
            display: "grid",
            gap: "0.2rem",
            position: "relative",
            zIndex: 1,
          }}
        >
          <div
            style={{
              color: tone,
              fontSize: compact ? "0.58rem" : "0.64rem",
              fontWeight: 900,
              letterSpacing: compact ? "0.16em" : "0.18em",
              textTransform: "uppercase",
            }}
          >
            {label}
          </div>
          <div
            style={{
              color: "#f8fafc",
              fontFamily: "var(--font-display)",
              fontSize: compact ? "0.94rem" : "1.02rem",
              letterSpacing: "0.05em",
            }}
          >
            {title}
          </div>
          <div
            style={{
              color: "rgba(226,232,240,0.72)",
              fontSize: compact ? "0.79rem" : "0.86rem",
              lineHeight: compact ? 1.42 : 1.5,
            }}
          >
            {description}
          </div>
        </div>
        {rightSlot ? (
          <div
            style={{
              position: "relative",
              zIndex: 1,
              flexShrink: 0,
              maxWidth: "100%",
            }}
          >
            {rightSlot}
          </div>
        ) : null}
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
        borderRadius: "0",
        padding: "0.85rem 1rem",
        textAlign: "center",
        background: `${color}0f`,
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

function ProgressRail({
  label,
  value,
  total,
  color,
}: {
  label: string;
  value: number;
  total: number;
  color: string;
}) {
  const percentage =
    total > 0 ? Math.max(0, Math.min(100, (value / total) * 100)) : 0;

  return (
    <div style={{ display: "grid", gap: "0.45rem" }}>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: "0.75rem",
        }}
      >
        <div style={{ ...eyebrowStyle, color: "#94a3b8" }}>{label}</div>
        <div
          style={{
            color,
            fontFamily: "var(--font-display)",
            fontSize: "0.88rem",
            letterSpacing: "0.08em",
          }}
        >
          {value}/{total}
        </div>
      </div>
      <div
        style={{
          height: "10px",
          border: "1px solid rgba(148,163,184,0.14)",
          background: "rgba(15,23,42,0.78)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${percentage}%`,
            height: "100%",
            background: `linear-gradient(90deg, ${color}, ${color}aa)`,
            boxShadow: `0 0 18px ${color}44`,
            transition: "width 180ms ease",
          }}
        />
      </div>
    </div>
  );
}

function StatusTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: string;
}) {
  return (
    <div
      style={{
        display: "grid",
        gap: "0.15rem",
        padding: "0.7rem 0.8rem",
        border: `1px solid ${tone}26`,
        background: `linear-gradient(180deg, ${tone}10, rgba(255,255,255,0.02))`,
      }}
    >
      <div
        style={{
          color: "#94a3b8",
          fontSize: "0.66rem",
          fontWeight: 800,
          letterSpacing: "0.16em",
          textTransform: "uppercase",
        }}
      >
        {label}
      </div>
      <div
        style={{
          color: tone,
          fontFamily: "var(--font-display)",
          fontSize: "1rem",
          letterSpacing: "0.05em",
        }}
      >
        {value}
      </div>
    </div>
  );
}

function getAggregatedMvpVoteCounts(
  runtimeCounts: Array<{ nomineeUserId: string; votes: number }>,
  votes: NonNullable<MatchState["mvpVotes"]>,
) {
  if (runtimeCounts.length > 0) return runtimeCounts;

  const tally = new Map<string, number>();
  votes.forEach((vote) => {
    tally.set(vote.nomineeUserId, (tally.get(vote.nomineeUserId) ?? 0) + 1);
  });

  return Array.from(tally.entries()).map(([nomineeUserId, count]) => ({
    nomineeUserId,
    votes: count,
  }));
}

function toDisplayTeam(
  players: Player[],
  teamNumber: 1 | 2,
  status: MatchStatus,
  winner: 1 | 2 | null,
  mvpUserId: string | null,
  onlineUserIds: Set<string> | null = null,
  mvpVoteCounts: Array<{ nomineeUserId: string; votes: number }> = [],
) {
  const realPlayers = [...players].sort(
    (a, b) => Number(b.isCaptain) - Number(a.isCaptain),
  );
  const leader = realPlayers[0]?.user.username ?? `Equipo ${teamNumber}`;
  const captain =
    realPlayers.find((player) => player.isCaptain)?.user.username ?? leader;

  const padded = [
    ...realPlayers.map((player) => ({
      id: player.userId ?? `bot-${player.team}-${player.user.id}`,
      userId: player.userId,
      name: player.user.username,
      avatar: player.user.avatar,
      level: parseLevelFromRank(player.user.rank),
      isCaptain: player.isCaptain,
      placeholder: Boolean(player.isBot),
      winrate: player.user.winrate ?? 0,
      wins: player.user.wins ?? 0,
      losses: player.user.losses ?? 0,
      countryCode: player.user.countryCode ?? null,
      recentMatches: player.user.recentMatches ?? [],
      mmrDelta: player.mmrDelta ?? null,
      isWinner: winner != null && player.team === winner,
      isMvp: player.userId != null && player.userId === mvpUserId,
      isOnline: onlineUserIds && player.userId ? onlineUserIds.has(player.userId) : null,
      mvpVotes: player.userId
        ? (mvpVoteCounts.find((entry) => entry.nomineeUserId === player.userId)
            ?.votes ?? 0)
        : 0,
      mmrBefore: player.mmrBefore,
    })),
  ];

  while (padded.length < 5) {
    padded.push({
      id: `mock-${teamNumber}-${padded.length}`,
      userId: null,
      name: `${teamNumber === 1 ? "Blue" : "Red"} Mock ${padded.length}`,
      avatar: null,
      level: 1,
      isCaptain: false,
      placeholder: true,
      winrate: 0,
      wins: 0,
      losses: 0,
      countryCode: null,
      recentMatches: [],
      mmrDelta: null,
      isWinner: false,
      isMvp: false,
      isOnline: null,
      mvpVotes: 0,
      mmrBefore: 0,
    });
  }

  return {
    name: `Team ${leader}`,
    captainName: captain,
    realPlayersCount: realPlayers.filter((player) => !player.isBot).length,
    avgWinrate: realPlayers.length
      ? Math.round(
          realPlayers.reduce(
            (sum, player) => sum + (player.user.winrate ?? 0),
            0,
          ) / realPlayers.length,
        )
      : 0,
    players: padded,
    status,
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

function getPlayerNameById(match: MatchState, userId: string) {
  return (
    match.players.find((player) => player.userId === userId)?.user.username ??
    "Jugador"
  );
}

function getMapNameFromId(mapId: string) {
  return MAP_NAME_BY_ID[mapId];
}

function formatPresenceUpdatedAt(value: number | null | undefined) {
  if (!value) return "Sin señal";
  const seconds = Math.max(0, Math.round((Date.now() - value) / 1000));
  if (seconds < 5) return "Ahora";
  if (seconds < 60) return `Hace ${seconds}s`;
  const minutes = Math.round(seconds / 60);
  return `Hace ${minutes}m`;
}

function formatDuration(totalSeconds: number) {
  const safeSeconds = Math.max(0, Math.round(totalSeconds));
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function getReplayResolutionLabel(status?: ReplayResolutionStatus) {
  switch (status) {
    case "auto_result_applied":
      return "Auto-cierre";
    case "verified_existing_result":
      return "Verificado";
    case "winner_mismatch":
      return "Discrepancia";
    case "awaiting_manual_vote":
      return "Manual";
    case "parser_failed":
      return "Parser falló";
    case "insufficient_data":
      return "Insuficiente";
    default:
      return "Pendiente";
  }
}

function formatReplayTrust(
  confidence: "high" | "medium" | "low" | null | undefined,
  score: number | null | undefined,
) {
  const label =
    confidence === "high"
      ? "Alta"
      : confidence === "medium"
        ? "Media"
        : confidence === "low"
          ? "Baja"
          : "Pendiente";
  return typeof score === "number" ? `${label} · ${score}/100` : label;
}

function getReplayTrustTone(
  confidence: "high" | "medium" | "low" | null | undefined,
  score: number | null | undefined,
) {
  if (confidence === "high" || (typeof score === "number" && score >= 75)) {
    return "#4ade80";
  }
  if (confidence === "medium" || (typeof score === "number" && score >= 55)) {
    return "#fbbf24";
  }
  if (confidence === "low" || typeof score === "number") return "#f87171";
  return "#94a3b8";
}

function formatReplayWarnings(warnings: string[]) {
  const labels: Record<string, string> = {
    map_mismatch: "mapa no coincide",
    low_player_match_coverage: "pocos jugadores matcheados",
    no_linked_battletags: "sin BattleTags vinculados",
    username_only_identity: "identidad sólo por nombre",
    matched_users_missing_battletag: "faltan BattleTags en perfiles",
    battletag_mismatch: "BattleTag distinto",
    team_mismatch: "equipo distinto",
  };
  return warnings.map((warning) => labels[warning] ?? warning).join(" · ");
}

function formatReplayNumber(value: number | null | undefined) {
  if (typeof value !== "number" || Number.isNaN(value)) return "—";
  return new Intl.NumberFormat("es-AR").format(value);
}

function formatNullableNumber(value: number | null | undefined) {
  if (typeof value !== "number" || Number.isNaN(value)) return "—";
  return String(value);
}

function formatReplayDate(value: string | Date | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "short",
    year: "2-digit",
  });
}

function formatBytes(value: number | null | undefined) {
  if (typeof value !== "number" || Number.isNaN(value)) return "—";
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function sortReplayPlayers(players: ReplayPlayerSummary[]) {
  return [...players].sort((a, b) => {
    const teamA = a.team ?? 3;
    const teamB = b.team ?? 3;
    if (teamA !== teamB) return teamA - teamB;
    if (a.won !== b.won) return a.won ? -1 : 1;
    return (
      getReplayMetricValue(b, "takedowns") -
      getReplayMetricValue(a, "takedowns")
    );
  });
}

function getReplayMetricValue(
  player: ReplayPlayerSummary,
  key: ReplayMetricKey,
) {
  const value = player[key];
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function sumReplayMetric(players: ReplayPlayerSummary[], key: ReplayMetricKey) {
  return players.reduce(
    (sum, player) => sum + getReplayMetricValue(player, key),
    0,
  );
}

function getTopReplayPlayer(
  players: ReplayPlayerSummary[],
  key: ReplayMetricKey,
) {
  return players.reduce<ReplayPlayerSummary | null>((top, player) => {
    if (!top) return player;
    return getReplayMetricValue(player, key) > getReplayMetricValue(top, key)
      ? player
      : top;
  }, null);
}

function getTeamReplayTotals(players: ReplayPlayerSummary[], team: 1 | 2) {
  const teamPlayers = players.filter((player) => player.team === team);
  return {
    takedowns: sumReplayMetric(teamPlayers, "takedowns"),
    kills: sumReplayMetric(teamPlayers, "kills"),
    deaths: sumReplayMetric(teamPlayers, "deaths"),
    assists: sumReplayMetric(teamPlayers, "assists"),
    heroDamage: sumReplayMetric(teamPlayers, "heroDamage"),
    siegeDamage: sumReplayMetric(teamPlayers, "siegeDamage"),
    structureDamage: sumReplayMetric(teamPlayers, "structureDamage"),
    minionDamage: sumReplayMetric(teamPlayers, "minionDamage"),
    healing: sumReplayMetric(teamPlayers, "healing"),
    selfHealing: sumReplayMetric(teamPlayers, "selfHealing"),
    damageTaken: sumReplayMetric(teamPlayers, "damageTaken"),
    protection: sumReplayMetric(teamPlayers, "protection"),
    experience: sumReplayMetric(teamPlayers, "experience"),
    mercCampCaptures: sumReplayMetric(teamPlayers, "mercCampCaptures"),
    timeSpentDead: sumReplayMetric(teamPlayers, "timeSpentDead"),
    ccTime: sumReplayMetric(teamPlayers, "ccTime"),
  };
}

function getReplayPlayerShortName(player: ReplayPlayerSummary) {
  return (player.battleTag ?? player.name).replace(/#\d+$/, "");
}

function formatReplayPlayerLoadout(player: ReplayPlayerSummary) {
  const talents = player.talents?.length ?? 0;
  const awards = player.awards?.length ?? 0;
  if (talents > 0 && awards > 0) return `${talents} talentos · ${awards} premios`;
  if (talents > 0) return `${talents} talentos`;
  if (awards > 0) return `${awards} premios`;
  return "build pendiente";
}

function getTeamDisplayName(
  teams: {
    left: ReturnType<typeof toDisplayTeam>;
    right: ReturnType<typeof toDisplayTeam>;
  },
  team: 1 | 2 | null,
) {
  if (team === 1) return teams.left.name;
  if (team === 2) return teams.right.name;
  return "Equipo pendiente";
}

function getReplayUploadStatusTone(status: string | null | undefined) {
  if (status === "PARSED") return "#4ade80";
  if (status === "FAILED") return "#f87171";
  if (status === "UPLOADED") return "#fbbf24";
  return "#94a3b8";
}

function getReplayResolutionTone(status?: ReplayResolutionStatus) {
  if (status === "winner_mismatch") return "#f87171";
  if (status === "auto_result_applied") return "#4ade80";
  if (status === "verified_existing_result") return "#38bdf8";
  if (status === "awaiting_manual_vote") return "#c084fc";
  if (status === "parser_failed") return "#f87171";
  return "#fbbf24";
}

function normalizeReplayIdentity(value: string | null | undefined) {
  return (value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/#\d+$/, "")
    .replace(/[^a-z0-9]+/g, "");
}

function findReplayHeroByName(name: string | null | undefined) {
  if (!name) return null;
  const direct = HERO_ID_BY_NAME[name];
  if (direct) return HERO_BY_ID[direct] ?? null;

  const normalized = normalizeReplayIdentity(name);
  return (
    HOTS_HEROES.find(
      (hero) =>
        normalizeReplayIdentity(hero.name) === normalized ||
        normalizeReplayIdentity(hero.id) === normalized,
    ) ?? null
  );
}

function getHeroImageSources(hero: HotsHero) {
  const base = hero.portrait.replace(/\.(webp|avif)$/i, "");
  const ext = hero.portrait.match(/\.(webp|avif)$/i)?.[1]?.toLowerCase();
  return [hero.portrait, `${base}.${ext === "avif" ? "webp" : "avif"}`];
}

function findMatchPlayerForReplay(
  matchPlayers: Player[],
  replayPlayer: ReplayPlayerSummary,
) {
  const replayName = normalizeReplayIdentity(replayPlayer.name);
  const replayBattleTag = normalizeReplayIdentity(replayPlayer.battleTag);
  const sameTeamPlayers = matchPlayers.filter(
    (player) => player.team === replayPlayer.team && !player.isBot,
  );

  return (
    sameTeamPlayers.find((player) => {
      const username = normalizeReplayIdentity(player.user.username);
      return (
        username === replayName ||
        username === replayBattleTag ||
        Boolean(username && replayBattleTag.includes(username)) ||
        Boolean(replayName && username.includes(replayName))
      );
    }) ?? null
  );
}

function getReplayPlayerForMatchUser(
  replayPlayers: ReplayPlayerSummary[],
  matchPlayers: Player[],
  userId: string | null,
) {
  if (!userId) return null;
  const matchPlayer = matchPlayers.find((player) => player.userId === userId);
  if (!matchPlayer) return null;
  return (
    replayPlayers.find((replayPlayer) => {
      const resolved = findMatchPlayerForReplay(matchPlayers, replayPlayer);
      return resolved?.userId === matchPlayer.userId;
    }) ?? null
  );
}

const pageShellStyle: CSSProperties = {
  minHeight: "calc(100vh - 48px)",
  padding: "0",
  position: "relative",
};

const panelStyle: CSSProperties = {
  width: "100%",
  background: "transparent",
  border: "none",
  borderRadius: "0",
  boxShadow: "none",
  padding: "0",
  display: "grid",
  gap: "0.68rem",
};

const centerColumnStyle: CSSProperties = {
  minWidth: 0,
  display: "grid",
  gap: "0.68rem",
  alignContent: "start",
};

function teamsGridStyle(isTablet: boolean): CSSProperties {
  return {
    display: "grid",
    gridTemplateColumns: isTablet
      ? "minmax(230px, 0.94fr) minmax(300px, 1.04fr) minmax(230px, 0.94fr)"
      : "minmax(280px, 1fr) minmax(360px, 440px) minmax(280px, 1fr)",
    gap: isTablet ? "0.72rem" : "0.82rem",
    alignItems: "stretch",
  };
}

function mobileTeamGridStyle(isNarrow: boolean): CSSProperties {
  return {
    display: "grid",
    gridTemplateColumns: isNarrow ? "1fr" : "1fr 1fr",
    gap: "1rem",
  };
}

const teamColumnStyle: CSSProperties = {
  minWidth: 0,
  border: "1px solid",
  borderRadius: "0",
  padding: "0.78rem",
  display: "grid",
  gap: "0.68rem",
  alignContent: "start",
  position: "relative",
  overflow: "hidden",
  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.035)",
};

function teamHeaderStyle(mirrored: boolean): CSSProperties {
  return {
    display: "flex",
    flexDirection: mirrored ? "row-reverse" : "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: "0.65rem",
  };
}

const teamTitleStyle: CSSProperties = {
  marginTop: "0.18rem",
  color: "#f8fafc",
  fontFamily: "var(--font-display)",
  fontSize: "1.08rem",
  fontWeight: 900,
  letterSpacing: "0.04em",
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};

const teamRosterStyle: CSSProperties = {
  display: "grid",
  gap: "0.42rem",
};

function presenceMiniTagStyle(online: boolean): CSSProperties {
  const tone = online ? "#4ade80" : "#fbbf24";
  return {
    flexShrink: 0,
    padding: "0.16rem 0.36rem",
    border: `1px solid ${tone}66`,
    background: `${tone}18`,
    color: tone,
    fontSize: "0.54rem",
    fontWeight: 950,
    letterSpacing: "0.11em",
  };
}

function playerNameRowStyle(mirrored: boolean): CSSProperties {
  return {
    display: "flex",
    flexDirection: mirrored ? "row-reverse" : "row",
    alignItems: "center",
    justifyContent: mirrored ? "flex-end" : "flex-start",
    gap: "0.35rem",
    minWidth: 0,
  };
}

const playerNameStyle: CSSProperties = {
  minWidth: 0,
  color: "#f8fafc",
  fontWeight: 850,
  fontSize: "0.86rem",
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};

function playerSublineStyle(mirrored: boolean): CSSProperties {
  return {
    marginTop: "0.1rem",
    color: "rgba(148,163,184,0.78)",
    fontSize: "0.72rem",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    textAlign: mirrored ? "right" : "left",
  };
}

const recentFormStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: "0.2rem",
};

function captainMiniTagStyle(accent: string): CSSProperties {
  return {
    flexShrink: 0,
    padding: "0.18rem 0.38rem",
    border: `1px solid ${accent}66`,
    background: `${accent}20`,
    color: accent,
    fontSize: "0.56rem",
    fontWeight: 950,
    letterSpacing: "0.12em",
  };
}

const mvpMiniTagStyle: CSSProperties = {
  flexShrink: 0,
  padding: "0.18rem 0.42rem",
  border: "1px solid rgba(250,204,21,0.68)",
  background:
    "linear-gradient(180deg, rgba(250,204,21,0.28), rgba(161,98,7,0.24))",
  color: "#facc15",
  boxShadow: "0 0 18px rgba(250,204,21,0.18)",
  fontSize: "0.58rem",
  fontWeight: 950,
  letterSpacing: "0.12em",
};

const botTagStyle: CSSProperties = {
  color: "#94a3b8",
  border: "1px solid rgba(148,163,184,0.18)",
  padding: "0.16rem 0.35rem",
  fontSize: "0.62rem",
  fontWeight: 900,
};

function teamCaptainLineStyle(mirrored: boolean): CSSProperties {
  return {
    marginTop: "0.2rem",
    color: "rgba(226,232,240,0.55)",
    fontSize: "0.68rem",
    fontWeight: 800,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    textAlign: mirrored ? "right" : "left",
  };
}

function teamSummaryStackStyle(mirrored: boolean): CSSProperties {
  return {
    display: "flex",
    gap: "0.42rem",
    flexWrap: "wrap",
    justifyContent: mirrored ? "flex-start" : "flex-end",
    flexDirection: mirrored ? "row-reverse" : "row",
  };
}

function playerDuelCardStyle({
  placeholder,
  captain,
  mvp,
  mirrored,
  accent,
  slot,
}: {
  placeholder: boolean;
  captain: boolean;
  mvp: boolean;
  mirrored: boolean;
  accent: string;
  slot: number;
}): CSSProperties {
  const borderTone = mvp
    ? "rgba(250,204,21,0.64)"
    : captain
      ? `${accent}66`
      : placeholder
        ? "rgba(100,116,139,0.22)"
        : "rgba(148,163,184,0.16)";
  return {
    position: "relative",
    minWidth: 0,
    minHeight: "112px",
    display: "flex",
    flexDirection: mirrored ? "row-reverse" : "row",
    alignItems: "center",
    gap: "0.76rem",
    padding: mirrored ? "0.72rem 0.64rem 0.72rem 0.82rem" : "0.72rem 0.82rem 0.72rem 0.64rem",
    border: `1px solid ${borderTone}`,
    background: placeholder
      ? "linear-gradient(135deg, rgba(30,41,59,0.34), rgba(2,6,23,0.48))"
      : `linear-gradient(${mirrored ? 245 : 115}deg, ${accent}16 0%, rgba(8,16,30,0.78) 38%, rgba(2,6,23,0.62) 100%)`,
    boxShadow: mvp
      ? `${mirrored ? "inset -3px" : "inset 3px"} 0 0 #facc15, 0 0 28px rgba(250,204,21,0.11)`
      : captain
        ? `${mirrored ? "inset -3px" : "inset 3px"} 0 0 ${accent}, 0 0 22px ${accent}10`
        : `inset 0 1px 0 rgba(255,255,255,0.035), 0 ${Math.max(0, 7 - slot)}px 18px rgba(0,0,0,0.12)`,
    overflow: "hidden",
  };
}

function playerIdentityBlockStyle(mirrored: boolean): CSSProperties {
  return {
    minWidth: 0,
    display: "flex",
    flexDirection: mirrored ? "row-reverse" : "row",
    alignItems: "center",
    gap: "0.72rem",
  };
}

function playerNameStackStyle(mirrored: boolean): CSSProperties {
  return {
    minWidth: 0,
    display: "grid",
    gap: "0.28rem",
    justifyItems: mirrored ? "end" : "start",
    textAlign: mirrored ? "right" : "left",
  };
}

function playerRoleTagRowStyle(mirrored: boolean): CSSProperties {
  return {
    display: "flex",
    flexDirection: mirrored ? "row-reverse" : "row",
    gap: "0.28rem",
    flexWrap: "wrap",
    justifyContent: mirrored ? "flex-end" : "flex-start",
  };
}

function playerStatSentenceStyle(mirrored: boolean): CSSProperties {
  return {
    color: "rgba(203,213,225,0.78)",
    fontSize: "0.72rem",
    fontWeight: 800,
    letterSpacing: "0.035em",
    display: "flex",
    flexDirection: mirrored ? "row-reverse" : "row",
    justifyContent: mirrored ? "flex-end" : "flex-start",
    alignItems: "center",
    gap: "0.34rem",
    flexWrap: "wrap",
  };
}

function playerAvatarFrameStyle(
  accent: string,
  isMvp: boolean,
): CSSProperties {
  return {
    position: "relative",
    flexShrink: 0,
    display: "grid",
    placeItems: "center",
    padding: "0.16rem",
    border: `1px solid ${isMvp ? "rgba(250,204,21,0.72)" : `${accent}55`}`,
    background: `radial-gradient(circle, ${isMvp ? "rgba(250,204,21,0.20)" : `${accent}22`} 0%, rgba(2,6,23,0.18) 68%)`,
    boxShadow: `0 0 22px ${isMvp ? "rgba(250,204,21,0.18)" : `${accent}1a`}`,
  };
}

function playerSlotBadgeStyle(mirrored: boolean, accent: string): CSSProperties {
  return {
    position: "absolute",
    top: "-7px",
    ...(mirrored ? { left: "-7px" } : { right: "-7px" }),
    minWidth: "20px",
    height: "20px",
    display: "grid",
    placeItems: "center",
    border: `1px solid ${accent}88`,
    background: "rgba(2,6,23,0.94)",
    color: accent,
    fontFamily: "var(--font-display)",
    fontSize: "0.62rem",
    fontWeight: 950,
    boxShadow: `0 0 16px ${accent}26`,
  };
}

const playerRankBadgeDockStyle: CSSProperties = {
  position: "absolute",
  bottom: "-10px",
  left: "50%",
  transform: "translateX(-50%) scale(0.74)",
  transformOrigin: "center",
  pointerEvents: "none",
};

function playerDuelBodyStyle(mirrored: boolean): CSSProperties {
  return {
    minWidth: 0,
    flex: 1,
    display: "grid",
    gap: "0.42rem",
    justifyItems: mirrored ? "end" : "start",
    textAlign: mirrored ? "right" : "left",
  };
}

function playerDuelFooterStyle(mirrored: boolean): CSSProperties {
  return {
    width: "100%",
    display: "flex",
    flexDirection: mirrored ? "row-reverse" : "row",
    justifyContent: mirrored ? "flex-end" : "flex-start",
    alignItems: "center",
    gap: "0.34rem",
    flexWrap: "wrap",
  };
}

const recentFormLabelStyle: CSSProperties = {
  color: "rgba(148,163,184,0.76)",
  fontSize: "0.58rem",
  fontWeight: 950,
  letterSpacing: "0.11em",
  textTransform: "uppercase",
};

const mvpVoteSlimTagStyle: CSSProperties = {
  border: "1px solid rgba(250,204,21,0.38)",
  background: "rgba(250,204,21,0.10)",
  color: "#facc15",
  padding: "0.2rem 0.42rem",
  fontSize: "0.58rem",
  fontWeight: 950,
  letterSpacing: "0.1em",
  textTransform: "uppercase",
};

const winnerMiniTagStyle: CSSProperties = {
  border: "1px solid rgba(74,222,128,0.46)",
  background: "rgba(74,222,128,0.12)",
  color: "#4ade80",
  padding: "0.2rem 0.42rem",
  fontSize: "0.58rem",
  fontWeight: 950,
  letterSpacing: "0.1em",
};

function mmrDeltaBadgeStyle(delta: number): CSSProperties {
  const positive = delta >= 0;
  const tone = positive ? "#4ade80" : "#f87171";

  return {
    minWidth: "70px",
    padding: "0.24rem 0.44rem",
    border: `1px solid ${positive ? "rgba(74,222,128,0.42)" : "rgba(248,113,113,0.42)"}`,
    background: positive ? "rgba(74,222,128,0.12)" : "rgba(248,113,113,0.12)",
    color: tone,
    fontSize: "0.62rem",
    fontWeight: 950,
    letterSpacing: "0.08em",
    textAlign: "center",
    whiteSpace: "nowrap",
    boxShadow: `0 0 14px ${positive ? "rgba(74,222,128,0.10)" : "rgba(248,113,113,0.10)"}`,
  };
}

const closureArchiveStyle: CSSProperties = {
  display: "grid",
  gap: "0.72rem",
  border: "1px solid rgba(148,163,184,0.16)",
  background:
    "linear-gradient(135deg, rgba(15,23,42,0.72), rgba(2,6,23,0.68))",
  padding: "0.78rem",
};

const closureArchiveColumnStyle: CSSProperties = {
  display: "grid",
  gap: "0.45rem",
};

const closureChipWrapStyle: CSSProperties = {
  display: "flex",
  gap: "0.36rem",
  flexWrap: "wrap",
};

function closureChipStyle(tone: string): CSSProperties {
  return {
    border: `1px solid ${tone}40`,
    background: `${tone}11`,
    color: "#e2e8f0",
    padding: "0.34rem 0.48rem",
    fontSize: "0.66rem",
    fontWeight: 850,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
  };
}

const closureMutedStyle: CSSProperties = {
  color: "rgba(148,163,184,0.72)",
  fontSize: "0.76rem",
  fontWeight: 750,
};

const closureVoteGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: "0.5rem",
};

function opsStripStyle(tone: string, warning: boolean): CSSProperties {
  return {
    minWidth: 0,
    border: `1px solid ${warning ? "rgba(251,191,36,0.42)" : `${tone}3d`}`,
    background: `linear-gradient(135deg, ${warning ? "rgba(251,191,36,0.10)" : `${tone}10`}, rgba(2,6,23,0.72) 44%, rgba(2,6,23,0.56))`,
    padding: "0.7rem 0.78rem",
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr)",
    gap: "0.5rem",
    boxShadow: `inset 0 1px 0 rgba(255,255,255,0.04), 0 0 30px ${tone}0f`,
  };
}

const opsStripMainStyle: CSSProperties = {
  minWidth: 0,
  display: "grid",
  gap: "0.12rem",
};

const opsStripMetaStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: "0.36rem",
  alignItems: "center",
};

function opsPillStyle(tone: string): CSSProperties {
  return {
    minWidth: 0,
    maxWidth: "100%",
    border: `1px solid ${tone}38`,
    background: `${tone}12`,
    color: tone,
    padding: "0.28rem 0.44rem",
    fontSize: "0.64rem",
    fontWeight: 900,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  };
}

const opsOfflineStyle: CSSProperties = {
  borderTop: "1px solid rgba(251,191,36,0.18)",
  paddingTop: "0.42rem",
  color: "#fde68a",
  fontSize: "0.74rem",
  fontWeight: 800,
  lineHeight: 1.35,
};

const stageCardStyle: CSSProperties = {
  minWidth: 0,
  border: "1px solid var(--nexus-border)",
  borderColor: "var(--nexus-border)",
  borderRadius: "0",
  padding: "0.78rem",
  display: "grid",
  gap: "0.68rem",
  background: "rgba(6,12,24,0.78)",
  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.03)",
};

function commandHeaderStyle(
  mapImageUrl: string,
  accent: string,
): CSSProperties {
  return {
    position: "relative",
    overflow: "hidden",
    minHeight: "238px",
    border: `1px solid ${accent}30`,
    backgroundColor: "#050b15",
    backgroundImage: mapImageUrl
      ? `linear-gradient(115deg, rgba(2,6,23,0.96) 0%, rgba(2,8,18,0.86) 42%, rgba(2,6,23,0.54) 100%), radial-gradient(circle at 18% 12%, ${accent}28, transparent 30%), url(${mapImageUrl})`
      : `linear-gradient(115deg, rgba(2,6,23,0.96), rgba(4,13,26,0.86)), radial-gradient(circle at 18% 12%, ${accent}28, transparent 30%)`,
    backgroundSize: "cover",
    backgroundPosition: "center",
    padding: "clamp(1rem, 2vw, 1.35rem)",
    display: "grid",
    alignContent: "space-between",
    gap: "1.25rem",
    boxShadow:
      "inset 0 1px 0 rgba(255,255,255,0.05), 0 22px 54px rgba(0,0,0,0.28)",
  };
}

const commandHeaderOverlayStyle: CSSProperties = {
  position: "absolute",
  inset: 0,
  pointerEvents: "none",
  background:
    "linear-gradient(90deg, rgba(255,255,255,0.035) 1px, transparent 1px), linear-gradient(0deg, rgba(255,255,255,0.025) 1px, transparent 1px)",
  backgroundSize: "44px 44px",
  maskImage: "linear-gradient(90deg, rgba(0,0,0,0.95), transparent 72%)",
};

const commandHeaderToplineStyle: CSSProperties = {
  position: "relative",
  zIndex: 1,
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: "1rem",
  flexWrap: "wrap",
};

const commandTitleStyle: CSSProperties = {
  margin: 0,
  color: "#f8fafc",
  fontFamily: "var(--font-display)",
  fontSize: "clamp(2rem, 5vw, 4.6rem)",
  lineHeight: 0.86,
  fontWeight: 950,
  letterSpacing: "0.075em",
  textTransform: "uppercase",
  textShadow: "0 3px 28px rgba(0,0,0,0.75)",
};

const commandSublineStyle: CSSProperties = {
  display: "flex",
  gap: "0.5rem",
  alignItems: "center",
  flexWrap: "wrap",
  color: "rgba(226,232,240,0.68)",
  fontSize: "0.82rem",
  letterSpacing: "0.08em",
  textTransform: "uppercase",
};

const commandActionsStyle: CSSProperties = {
  display: "flex",
  gap: "0.75rem",
  alignItems: "center",
  flexWrap: "wrap",
  justifyContent: "flex-end",
};

const commandVersusGridStyle: CSSProperties = {
  position: "relative",
  zIndex: 1,
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: "0.75rem",
  alignItems: "stretch",
};

function commandTeamPlateStyle(tone: string, won: boolean): CSSProperties {
  return {
    minWidth: 0,
    border: `1px solid ${won ? tone : `${tone}44`}`,
    background: `linear-gradient(145deg, ${tone}${won ? "24" : "12"}, rgba(2,6,23,0.62) 48%, rgba(2,6,23,0.42))`,
    padding: "0.82rem 0.9rem",
    display: "flex",
    justifyContent: "space-between",
    gap: "0.8rem",
    alignItems: "center",
    boxShadow: won
      ? `0 0 0 1px ${tone}22, 0 0 34px ${tone}18, inset 0 1px 0 rgba(255,255,255,0.05)`
      : "inset 0 1px 0 rgba(255,255,255,0.035)",
  };
}

const commandTeamNameStyle: CSSProperties = {
  color: "#f8fafc",
  fontFamily: "var(--font-display)",
  fontSize: "clamp(1rem, 2vw, 1.45rem)",
  fontWeight: 950,
  letterSpacing: "0.055em",
  textTransform: "uppercase",
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};

const commandTeamMetaStyle: CSSProperties = {
  display: "grid",
  gap: "0.22rem",
  justifyItems: "end",
  color: "rgba(226,232,240,0.66)",
  fontSize: "0.66rem",
  fontWeight: 850,
  letterSpacing: "0.09em",
  textTransform: "uppercase",
  whiteSpace: "nowrap",
};

function commandOutcomeBadgeStyle(won: boolean): CSSProperties {
  return {
    minWidth: "48px",
    minHeight: "48px",
    display: "grid",
    placeItems: "center",
    border: `1px solid ${won ? "rgba(74,222,128,0.75)" : "rgba(248,113,113,0.72)"}`,
    background: won
      ? "linear-gradient(180deg, rgba(34,197,94,0.24), rgba(20,83,45,0.18))"
      : "linear-gradient(180deg, rgba(239,68,68,0.24), rgba(127,29,29,0.18))",
    color: won ? "#4ade80" : "#f87171",
    boxShadow: won
      ? "0 0 24px rgba(74,222,128,0.18)"
      : "0 0 24px rgba(248,113,113,0.16)",
    fontFamily: "var(--font-display)",
    fontSize: "1.25rem",
    fontWeight: 950,
    letterSpacing: "0.08em",
  };
}

function teamPanelOutcomeBadgeStyle(won: boolean): CSSProperties {
  return {
    minWidth: "54px",
    minHeight: "54px",
    display: "grid",
    placeItems: "center",
    border: `1px solid ${won ? "rgba(74,222,128,0.75)" : "rgba(248,113,113,0.72)"}`,
    background: won
      ? "linear-gradient(180deg, rgba(34,197,94,0.26), rgba(20,83,45,0.18))"
      : "linear-gradient(180deg, rgba(239,68,68,0.22), rgba(127,29,29,0.18))",
    color: won ? "#4ade80" : "#f87171",
    boxShadow: won
      ? "0 0 26px rgba(74,222,128,0.16)"
      : "0 0 26px rgba(248,113,113,0.14)",
    fontFamily: "var(--font-display)",
    fontSize: "1.35rem",
    fontWeight: 950,
    letterSpacing: "0.08em",
  };
}

function commandCenterBladeStyle(accent: string): CSSProperties {
  return {
    border: `1px solid ${accent}46`,
    background:
      "linear-gradient(180deg, rgba(226,232,240,0.08), rgba(2,6,23,0.78))",
    display: "grid",
    placeItems: "center",
    gap: "0.12rem",
    padding: "0.72rem",
    textAlign: "center",
    boxShadow: `inset 0 1px 0 rgba(255,255,255,0.05), 0 0 28px ${accent}12`,
    color: "#e2e8f0",
    textTransform: "uppercase",
  };
}

function telemetryPanelStyle(mapImageUrl: string): CSSProperties {
  return {
    position: "relative",
    isolation: "isolate",
    overflow: "hidden",
    minWidth: 0,
    display: "grid",
    gap: "0.95rem",
    padding: "clamp(0.9rem, 2vw, 1.25rem)",
    border: "1px solid rgba(125,211,252,0.16)",
    backgroundColor: "rgba(4,9,18,0.88)",
    backgroundImage: mapImageUrl
      ? `linear-gradient(180deg, rgba(3,8,18,0.94), rgba(3,8,18,0.88)), radial-gradient(circle at 12% 0%, rgba(0,200,255,0.18), transparent 28%), radial-gradient(circle at 88% 4%, rgba(255,71,87,0.14), transparent 30%), url(${mapImageUrl})`
      : "linear-gradient(180deg, rgba(3,8,18,0.94), rgba(3,8,18,0.88)), radial-gradient(circle at 12% 0%, rgba(0,200,255,0.18), transparent 28%)",
    backgroundSize: "cover",
    backgroundPosition: "center",
    boxShadow:
      "inset 0 1px 0 rgba(255,255,255,0.04), 0 20px 48px rgba(0,0,0,0.22)",
  };
}

const telemetryPanelVeilStyle: CSSProperties = {
  position: "absolute",
  inset: 0,
  zIndex: -1,
  pointerEvents: "none",
  background:
    "linear-gradient(90deg, rgba(125,211,252,0.045) 1px, transparent 1px), linear-gradient(0deg, rgba(125,211,252,0.035) 1px, transparent 1px)",
  backgroundSize: "36px 36px",
  maskImage: "linear-gradient(180deg, rgba(0,0,0,0.85), transparent 82%)",
};

const telemetryHeaderStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: "1rem",
  flexWrap: "wrap",
};

const telemetryTitleStyle: CSSProperties = {
  margin: 0,
  color: "#f8fafc",
  fontFamily: "var(--font-display)",
  fontSize: "clamp(1.65rem, 3.2vw, 3.35rem)",
  lineHeight: 0.9,
  fontWeight: 950,
  letterSpacing: "0.07em",
  textTransform: "uppercase",
};

const telemetryDescriptionStyle: CSSProperties = {
  margin: 0,
  maxWidth: "760px",
  color: "rgba(226,232,240,0.64)",
  fontSize: "0.9rem",
  lineHeight: 1.55,
};

function telemetryUploadButtonStyle(disabled: boolean): CSSProperties {
  return {
    border: `1px solid ${disabled ? "rgba(148,163,184,0.18)" : "rgba(125,211,252,0.55)"}`,
    background: disabled
      ? "rgba(30,41,59,0.58)"
      : "linear-gradient(90deg, rgba(125,211,252,0.96), rgba(34,211,238,0.9))",
    color: disabled ? "#94a3b8" : "#020617",
    padding: "0.84rem 1rem",
    minWidth: "190px",
    cursor: disabled ? "not-allowed" : "pointer",
    fontFamily: "var(--font-display)",
    fontSize: "0.78rem",
    fontWeight: 950,
    letterSpacing: "0.12em",
    textTransform: "uppercase",
    boxShadow: disabled ? "none" : "0 0 24px rgba(34,211,238,0.14)",
  };
}

function replayUploadNoticeStyle(error: boolean): CSSProperties {
  return {
    border: `1px solid ${error ? "rgba(248,113,113,0.32)" : "rgba(74,222,128,0.28)"}`,
    background: error ? "rgba(127,29,29,0.18)" : "rgba(20,83,45,0.18)",
    color: error ? "#fecaca" : "#bbf7d0",
    padding: "0.58rem 0.7rem",
    fontSize: "0.82rem",
    lineHeight: 1.35,
  };
}

function telemetryNoticeStyle(tone: string): CSSProperties {
  return {
    border: `1px solid ${tone}55`,
    color: tone,
    padding: "0.68rem 0.78rem",
    fontSize: "0.84rem",
    lineHeight: 1.4,
    fontWeight: 750,
  };
}

const matchPostTabsStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "0.35rem",
  borderBottom: "1px solid rgba(148,163,184,0.16)",
  marginTop: "0.08rem",
};

function matchPostTabButtonStyle(active: boolean): CSSProperties {
  return {
    position: "relative",
    border: "none",
    borderBottom: `2px solid ${active ? "#ff6b00" : "transparent"}`,
    background: active
      ? "linear-gradient(180deg, rgba(255,107,0,0.10), rgba(255,107,0,0.02))"
      : "transparent",
    color: active ? "#ff8a2a" : "rgba(226,232,240,0.62)",
    padding: "0.72rem 0.78rem 0.62rem",
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    gap: "0.4rem",
    fontFamily: "var(--font-display)",
    fontSize: "0.76rem",
    fontWeight: 950,
    letterSpacing: "0.11em",
    textTransform: "uppercase",
  };
}

const matchPostTabBadgeStyle: CSSProperties = {
  borderRadius: "999px",
  background: "#ff6b00",
  color: "#120602",
  padding: "0.1rem 0.32rem",
  fontFamily: "var(--font-body)",
  fontSize: "0.55rem",
  fontWeight: 950,
  letterSpacing: "0.02em",
  textTransform: "uppercase",
};

function telemetryResultGridStyle(compact: boolean): CSSProperties {
  return {
    display: "grid",
    gridTemplateColumns: compact
      ? "1fr"
      : "minmax(280px, 0.72fr) minmax(0, 1.28fr)",
    gap: "0.75rem",
    alignItems: "stretch",
  };
}

function telemetryResultBladeStyle(
  winnerTeam: 1 | 2 | null,
  mapImageUrl: string,
): CSSProperties {
  const tone = winnerTeam ? TEAM_COLORS[winnerTeam].accent : "#7dd3fc";
  return {
    position: "relative",
    overflow: "hidden",
    minHeight: "156px",
    border: `1px solid ${tone}50`,
    padding: "1rem",
    display: "grid",
    alignContent: "end",
    gap: "0.28rem",
    backgroundColor: "rgba(2,6,23,0.72)",
    backgroundImage: mapImageUrl
      ? `linear-gradient(180deg, rgba(2,6,23,0.18), rgba(2,6,23,0.92)), radial-gradient(circle at 8% 100%, ${tone}35, transparent 40%), url(${mapImageUrl})`
      : `linear-gradient(180deg, rgba(2,6,23,0.48), rgba(2,6,23,0.92)), radial-gradient(circle at 8% 100%, ${tone}35, transparent 40%)`,
    backgroundSize: "cover",
    backgroundPosition: "center",
    boxShadow: `inset 0 1px 0 rgba(255,255,255,0.05), 0 0 32px ${tone}12`,
  };
}

const telemetryMicroLabelStyle: CSSProperties = {
  color: "rgba(226,232,240,0.72)",
  fontSize: "0.68rem",
  fontWeight: 900,
  letterSpacing: "0.16em",
  textTransform: "uppercase",
};

function telemetryWinnerStyle(winnerTeam: 1 | 2 | null): CSSProperties {
  const tone = winnerTeam ? TEAM_COLORS[winnerTeam].accent : "#e2e8f0";
  return {
    color: tone,
    fontFamily: "var(--font-display)",
    fontSize: "clamp(1.35rem, 3vw, 2.15rem)",
    lineHeight: 0.95,
    fontWeight: 950,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    textShadow: `0 0 22px ${tone}30`,
  };
}

const telemetryResultMetaStyle: CSSProperties = {
  display: "flex",
  gap: "0.42rem",
  flexWrap: "wrap",
  color: "rgba(226,232,240,0.78)",
  fontSize: "0.78rem",
  fontWeight: 800,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
};

function telemetryKpiGridStyle(narrow: boolean): CSSProperties {
  return {
    display: "grid",
    gridTemplateColumns: narrow ? "1fr 1fr" : "repeat(3, minmax(0, 1fr))",
    gap: "0.55rem",
  };
}

function telemetryKpiStyle(tone: string, large: boolean): CSSProperties {
  return {
    minWidth: 0,
    border: `1px solid ${tone}28`,
    background: `linear-gradient(180deg, ${tone}12, rgba(2,6,23,0.62))`,
    padding: large ? "0.82rem 0.9rem" : "0.68rem 0.72rem",
    display: "grid",
    gap: "0.18rem",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.035)",
  };
}

const telemetryUploadMetaStyle: CSSProperties = {
  display: "flex",
  gap: "0.6rem",
  flexWrap: "wrap",
  color: "rgba(226,232,240,0.58)",
  fontSize: "0.72rem",
  letterSpacing: "0.04em",
};

function combatKpiGridStyle(narrow: boolean): CSSProperties {
  return {
    display: "grid",
    gridTemplateColumns: narrow
      ? "repeat(2, minmax(0, 1fr))"
      : "repeat(6, minmax(0, 1fr))",
    gap: "0.58rem",
  };
}

const replayTeamBoardStyle: CSSProperties = {
  display: "grid",
  gap: "0.92rem",
};

const replayTeamDividerStyle: CSSProperties = {
  width: "min(320px, 52%)",
  height: "1px",
  justifySelf: "center",
  background:
    "linear-gradient(90deg, transparent, rgba(148,163,184,0.7), transparent)",
};

function replayTeamLaneStyle(tone: string, won: boolean): CSSProperties {
  return {
    border: `1px solid ${won ? tone : `${tone}38`}`,
    background: `linear-gradient(180deg, ${tone}${won ? "1d" : "10"}, rgba(2,6,23,0.76) 34%, rgba(2,6,23,0.58))`,
    padding: "0.82rem",
    display: "grid",
    gap: "0.72rem",
    boxShadow: won
      ? `0 0 34px ${tone}16, inset 0 1px 0 rgba(255,255,255,0.05)`
      : "inset 0 1px 0 rgba(255,255,255,0.035)",
  };
}

const replayTeamLaneHeaderStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: "0.75rem",
  alignItems: "flex-start",
};

function teamTelemetryResultStyle(won: boolean): CSSProperties {
  return {
    border: `1px solid ${won ? "rgba(74,222,128,0.44)" : "rgba(148,163,184,0.16)"}`,
    background: won ? "rgba(74,222,128,0.12)" : "rgba(15,23,42,0.58)",
    color: won ? "#86efac" : "#94a3b8",
    padding: "0.3rem 0.48rem",
    fontSize: "0.62rem",
    fontWeight: 950,
    letterSpacing: "0.1em",
    textTransform: "uppercase",
    whiteSpace: "nowrap",
  };
}

const teamTelemetryStatsStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(118px, 1fr))",
  gap: "0.5rem",
};

const replayPlayerTableScrollStyle: CSSProperties = {
  overflowX: "auto",
  paddingBottom: "0.1rem",
};

const replayPlayerTableStyle: CSSProperties = {
  minWidth: "980px",
  display: "grid",
  gap: "0.4rem",
};

const replayPlayerHeaderRowStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns:
    "minmax(220px, 1.3fr) minmax(140px, 0.9fr) 88px 92px repeat(4, minmax(112px, 0.74fr))",
  gap: "0.45rem",
  alignItems: "center",
  padding: "0 0.58rem",
  color: "rgba(186,230,253,0.62)",
  fontSize: "0.62rem",
  fontWeight: 950,
  letterSpacing: "0.11em",
  textTransform: "uppercase",
};

function replayPlayerRowStyle(
  tone: string,
  won: boolean,
  current: boolean,
): CSSProperties {
  return {
    display: "grid",
    gridTemplateColumns:
      "minmax(220px, 1.3fr) minmax(140px, 0.9fr) 88px 92px repeat(4, minmax(112px, 0.74fr))",
    gap: "0.45rem",
    alignItems: "center",
    border: `1px solid ${current ? "#facc15" : won ? `${tone}40` : "rgba(148,163,184,0.14)"}`,
    background: `linear-gradient(90deg, ${tone}${won ? "18" : "0d"}, rgba(2,6,23,0.62))`,
    padding: "0.52rem 0.58rem",
    minHeight: "72px",
    boxShadow: current
      ? "0 0 0 1px rgba(250,204,21,0.22), 0 0 22px rgba(250,204,21,0.12)"
      : "inset 0 1px 0 rgba(255,255,255,0.025)",
  };
}

const replayPlayerIdentityCellStyle: CSSProperties = {
  minWidth: 0,
  display: "flex",
  alignItems: "center",
  gap: "0.62rem",
};

const replayPlayerHeroCellStyle: CSSProperties = {
  minWidth: 0,
  color: "#e2e8f0",
  fontSize: "0.8rem",
  fontWeight: 850,
  display: "grid",
  gap: "0.16rem",
  overflow: "hidden",
};

const replayHighlightsGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
  gap: "0.58rem",
};

function replayHighlightCardStyle(tone: string): CSSProperties {
  return {
    minWidth: 0,
    position: "relative",
    overflow: "hidden",
    border: `1px solid ${tone}30`,
    background: `linear-gradient(135deg, ${tone}16, rgba(2,6,23,0.72) 58%, rgba(2,6,23,0.42))`,
    padding: "0.78rem",
    display: "grid",
    gap: "0.18rem",
    boxShadow: `inset 0 1px 0 rgba(255,255,255,0.04), 0 0 28px ${tone}0d`,
    color: "rgba(226,232,240,0.72)",
  };
}

const replayPlayerMetricValueStyle: CSSProperties = {
  color: "#f8fafc",
  fontSize: "0.8rem",
  fontWeight: 900,
  letterSpacing: "0.04em",
};

const replayInlineMetricStyle: CSSProperties = {
  minWidth: 0,
  display: "grid",
  gap: "0.28rem",
  color: "#f8fafc",
  fontSize: "0.76rem",
  fontWeight: 900,
};

const replayInlineMetricTrackStyle: CSSProperties = {
  position: "relative",
  height: "5px",
  border: "1px solid rgba(148,163,184,0.16)",
  background: "rgba(2,6,23,0.7)",
  overflow: "hidden",
};

function replayInlineMetricFillStyle(
  width: number,
  tone: string,
): CSSProperties {
  return {
    display: "block",
    width: `${width}%`,
    height: "100%",
    background: `linear-gradient(90deg, ${tone}, ${tone}aa)`,
    boxShadow: `0 0 14px ${tone}44`,
  };
}

function telemetryMiniStatStyle(tone: string): CSSProperties {
  return {
    minWidth: 0,
    border: `1px solid ${tone}22`,
    background: "rgba(2,6,23,0.44)",
    padding: "0.48rem 0.52rem",
    display: "grid",
    gap: "0.1rem",
  };
}

function heroEmblemStyle(
  tone: string,
  won: boolean,
  hasImage = false,
): CSSProperties {
  return {
    width: "48px",
    height: "48px",
    position: "relative",
    overflow: "hidden",
    display: "grid",
    placeItems: "center",
    border: `1px solid ${tone}5a`,
    background: won ? `${tone}20` : "rgba(15,23,42,0.72)",
    color: tone,
    fontFamily: "var(--font-display)",
    fontSize: "1.05rem",
    fontWeight: 950,
    letterSpacing: "0.08em",
    boxShadow: `inset 0 1px 0 rgba(255,255,255,0.05), 0 0 20px ${tone}12`,
    isolation: "isolate",
    flexShrink: 0,
    ...(hasImage
      ? {
          background: `linear-gradient(180deg, rgba(2,6,23,0.06), rgba(2,6,23,0.42)), ${won ? `${tone}18` : "rgba(15,23,42,0.72)"}`,
        }
      : {}),
  };
}

const replayHeroPortraitImageStyle: CSSProperties = {
  position: "absolute",
  inset: 0,
  width: "100%",
  height: "100%",
  objectFit: "cover",
  filter: "saturate(1.08) contrast(1.04)",
  transition: "opacity 160ms ease",
  zIndex: 0,
};

const replayHeroFallbackStyle: CSSProperties = {
  position: "relative",
  zIndex: 1,
  textShadow: "0 1px 10px rgba(0,0,0,0.62)",
};

const playerDossierNameRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "0.38rem",
  minWidth: 0,
};

const currentUserTagStyle: CSSProperties = {
  border: "1px solid rgba(250,204,21,0.46)",
  background: "rgba(250,204,21,0.13)",
  color: "#fde68a",
  padding: "0.12rem 0.32rem",
  fontSize: "0.54rem",
  fontWeight: 950,
  letterSpacing: "0.1em",
  textTransform: "uppercase",
};

const playerDossierSubStyle: CSSProperties = {
  color: "rgba(148,163,184,0.78)",
  fontSize: "0.72rem",
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};

const telemetryEmptyStateStyle: CSSProperties = {
  border: "1px dashed rgba(125,211,252,0.24)",
  background: "rgba(2,6,23,0.42)",
  padding: "1rem",
  display: "grid",
  gap: "0.4rem",
  color: "rgba(226,232,240,0.7)",
};

const vetoHintStripStyle: CSSProperties = {
  display: "flex",
  gap: "0.45rem",
  flexWrap: "wrap",
};

function vetoHintChipStyle(tone: string): CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    minHeight: "28px",
    padding: "0.28rem 0.5rem",
    border: `1px solid ${tone}2e`,
    background: `${tone}10`,
    color: tone,
    fontSize: "0.68rem",
    fontWeight: 800,
    letterSpacing: "0.06em",
  };
}

function mapGridStyle(isNarrow: boolean): CSSProperties {
  return {
    display: "grid",
    gridTemplateColumns: isNarrow ? "1fr" : "1fr 1fr",
    gap: "0.6rem",
    maxHeight: isNarrow ? "none" : "560px",
    overflowY: isNarrow ? "visible" : "auto",
    paddingRight: isNarrow ? 0 : "0.12rem",
  };
}

function MapSelectedCard({
  mapName,
  compact = false,
  dense = false,
}: {
  mapName: string;
  compact?: boolean;
  dense?: boolean;
}) {
  const [imgFailed, setImgFailed] = useState(false);
  const imageUrl = getMapImageUrl(mapName);
  const backdrop =
    MAP_BACKDROPS[mapName] ??
    "linear-gradient(135deg, rgba(0,200,255,0.25), rgba(15,23,42,0.95))";

  return (
    <div
      style={{
        position: "relative",
        minHeight: compact ? "138px" : dense ? "154px" : "180px",
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
          background:
            imgFailed || !imageUrl
              ? backdrop
              : "linear-gradient(to top, rgba(0,0,0,0.88) 0%, rgba(0,0,0,0.1) 55%, transparent 100%)",
        }}
      />
      {/* Content */}
      <div
        style={{
          position: "relative",
          zIndex: 1,
          padding: compact || dense ? "0.82rem 0.92rem" : "1rem 1.1rem",
          display: "flex",
          flexDirection: "column",
          gap: "0.2rem",
        }}
      >
        <div
          style={{
            fontSize: compact || dense ? "0.62rem" : "0.68rem",
            textTransform: "uppercase",
            letterSpacing: compact || dense ? "0.18em" : "0.22em",
            color: "rgba(203,213,225,0.75)",
            fontWeight: 700,
          }}
        >
          Battleground elegido
        </div>
        <div
          style={{
            fontFamily: "var(--font-display)",
            fontSize: compact ? "1.22rem" : dense ? "1.34rem" : "1.6rem",
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

function WinnerSummaryHero({
  winnerName,
  mapName,
  accent,
  compact = false,
}: {
  winnerName: string;
  mapName: string;
  accent: string;
  compact?: boolean;
}) {
  const [imgFailed, setImgFailed] = useState(false);
  const imageUrl = getMapImageUrl(mapName);
  const backdrop =
    MAP_BACKDROPS[mapName] ??
    "linear-gradient(135deg, rgba(0,200,255,0.25), rgba(15,23,42,0.95))";

  return (
    <div
      style={{
        position: "relative",
        minHeight: compact ? "200px" : "236px",
        overflow: "hidden",
        border: `1px solid ${accent}44`,
        background: "#0b1220",
        display: "flex",
        alignItems: "flex-end",
      }}
    >
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
            filter: "brightness(0.52) saturate(1.02)",
          }}
        />
      )}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            imgFailed || !imageUrl
              ? backdrop
              : `linear-gradient(180deg, rgba(2,6,23,0.14) 0%, rgba(2,6,23,0.44) 42%, rgba(2,6,23,0.92) 100%)`,
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: "auto auto -40px -20px",
          width: "220px",
          height: "220px",
          background: `radial-gradient(circle, ${accent}30 0%, transparent 70%)`,
          filter: "blur(10px)",
          pointerEvents: "none",
        }}
      />
      <div
        style={{
          position: "relative",
          zIndex: 1,
          width: "100%",
          padding: compact ? "1rem" : "1.15rem 1.2rem",
          display: "grid",
          gap: "0.35rem",
        }}
      >
        <div
          style={{
            color: accent,
            fontSize: "0.68rem",
            fontWeight: 900,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
          }}
        >
          Resultado consolidado
        </div>
        <div
          style={{
            color: "#f8fafc",
            fontFamily: "var(--font-display)",
            fontSize: compact ? "1.55rem" : "1.9rem",
            lineHeight: 1.05,
            letterSpacing: "0.05em",
            textTransform: "uppercase",
            textShadow: "0 2px 18px rgba(0,0,0,0.72)",
          }}
        >
          Ganó {winnerName}
        </div>
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.45rem",
            width: "fit-content",
            padding: "0.36rem 0.55rem",
            border: "1px solid rgba(226,232,240,0.18)",
            background: "rgba(2,6,23,0.42)",
            color: "#dbeafe",
            fontSize: "0.74rem",
            fontWeight: 800,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            backdropFilter: "blur(6px)",
          }}
        >
          <span style={{ color: "rgba(191,219,254,0.76)" }}>Mapa</span>
          <span>{mapName}</span>
        </div>
      </div>
    </div>
  );
}

function MapVetoCard({
  mapName,
  active,
  bannedBy,
  bannedByTone,
  onBan,
}: {
  mapName: string;
  active: boolean;
  bannedBy?: string | null;
  bannedByTone?: string;
  onBan: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const [imgFailed, setImgFailed] = useState(false);
  const imageUrl = getMapImageUrl(mapName);
  const backdrop =
    MAP_BACKDROPS[mapName] ??
    "linear-gradient(135deg, rgba(0,200,255,0.25), rgba(15,23,42,0.95))";
  const isBanned = Boolean(bannedBy);

  const isBanning = active && hovered && !isBanned;

  return (
    <button
      onClick={active ? onBan : undefined}
      disabled={!active || isBanned}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: "relative",
        border: `1px solid ${isBanning ? "rgba(248,113,113,0.7)" : active ? "rgba(148,163,184,0.25)" : "rgba(100,116,139,0.15)"}`,
        borderRadius: "2px",
        padding: 0,
        overflow: "hidden",
        cursor: active && !isBanned ? "pointer" : "not-allowed",
        aspectRatio: "16/6.6",
        background: "#0d1422",
        transition: "border-color 0.15s, box-shadow 0.12s, filter 0.12s",
        boxShadow: isBanning
          ? "0 0 0 1px rgba(248,113,113,0.35), inset 0 0 22px rgba(248,113,113,0.18)"
          : "none",
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
            opacity: active || isBanned ? 1 : 0.35,
            filter: isBanned
              ? "grayscale(1) brightness(0.38) contrast(1.1)"
              : isBanning
                ? "brightness(0.45)"
                : active
                  ? "brightness(0.75)"
                  : "brightness(0.4) saturate(0.6)",
            transition: "opacity 0.15s, filter 0.15s",
          }}
        />
      )}
      {/* Backdrop gradient — shown always when no image, or as bottom vignette when image exists */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            imgFailed || !imageUrl
              ? isBanning
                ? "linear-gradient(to top, rgba(248,113,113,0.55) 0%, rgba(0,0,0,0.4) 100%)"
                : backdrop
              : isBanned
                ? "linear-gradient(to top, rgba(2,6,23,0.92) 0%, rgba(2,6,23,0.5) 58%, rgba(2,6,23,0.35) 100%)"
                : isBanning
                  ? "linear-gradient(to top, rgba(200,30,30,0.7) 0%, transparent 55%)"
                  : "linear-gradient(to top, rgba(0,0,0,0.75) 0%, transparent 50%)",
          transition: "background 0.15s",
        }}
      />
      {isBanned && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 2,
            display: "grid",
            placeContent: "center",
            textAlign: "center",
            gap: "0.25rem",
            padding: "0.5rem",
          }}
        >
          <span
            style={{
              fontSize: "0.55rem",
              fontWeight: 800,
              letterSpacing: "0.16em",
              textTransform: "uppercase",
              color: "rgba(226,232,240,0.9)",
            }}
          >
            Vetado por
          </span>
          <span
            style={{
              fontFamily: "var(--font-display)",
              fontSize: "0.78rem",
              fontWeight: 900,
              letterSpacing: "0.04em",
              textTransform: "uppercase",
              color: bannedByTone ?? "#f8fafc",
              textShadow: "0 2px 8px rgba(0,0,0,0.85)",
            }}
          >
            {bannedBy}
          </span>
        </div>
      )}
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
              fontSize: "1.08rem",
              fontWeight: 900,
              color: "#fff",
              textShadow: "0 0 14px rgba(248,113,113,0.9)",
              lineHeight: 1,
              opacity: 0.95,
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
            color: active ? "#fff" : isBanned ? "#cbd5e1" : "#64748b",
            letterSpacing: "0.04em",
            textTransform: "uppercase",
            lineHeight: 1.2,
            textShadow:
              active || isBanned ? "0 1px 4px rgba(0,0,0,0.8)" : "none",
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
  padding: "0.72rem 0.86rem",
  background: "linear-gradient(90deg, #00c8ff, #38bdf8)",
  color: "#020617",
  fontWeight: 800,
  cursor: "pointer",
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  fontSize: "0.74rem",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  whiteSpace: "nowrap",
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
  padding: "0.58rem 0.82rem",
  background: "transparent",
  color: "#e2e8f0",
  cursor: "pointer",
  textTransform: "uppercase",
  letterSpacing: "0.07em",
  fontWeight: 700,
  fontSize: "0.72rem",
};

const playAgainButtonStyle: CSSProperties = {
  border: "1px solid rgba(0,200,255,0.28)",
  padding: "0.95rem 1rem",
  background:
    "linear-gradient(90deg, rgba(8,20,40,0.96), rgba(11,33,57,0.96) 45%, rgba(0,200,255,0.14))",
  color: "#e6f6ff",
  fontFamily: "var(--font-display)",
  fontSize: "0.96rem",
  fontWeight: 900,
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  cursor: "pointer",
  boxShadow:
    "inset 0 1px 0 rgba(255,255,255,0.04), 0 12px 24px rgba(0,0,0,0.22)",
};

const eyebrowStyle: CSSProperties = {
  color: "#94a3b8",
  textTransform: "uppercase",
  letterSpacing: "0.18em",
  fontSize: "0.72rem",
  fontWeight: 800,
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
  gap: "0.42rem",
  alignItems: "start",
};

const timelineStepStyle: CSSProperties = {
  display: "grid",
  gap: "0.35rem",
};

const timelineNodeRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
};

const timelineLabelStyle = (active: boolean): CSSProperties => ({
  color: active ? "#e2e8f0" : "#94a3b8",
  fontSize: "0.68rem",
  fontWeight: active ? 800 : 700,
  textTransform: "uppercase",
  letterSpacing: "0.1em",
});

function timelineNodeStyle(
  done: boolean,
  current: boolean,
  cancelled: boolean,
): CSSProperties {
  return {
    width: "28px",
    height: "28px",
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
    marginInline: "0.4rem",
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

function mvpCandidateStyle(
  selected: boolean,
  disabled: boolean,
  accent: string,
): CSSProperties {
  return {
    border: `1px solid ${
      selected ? "#facc15" : disabled ? "rgba(148,163,184,0.14)" : `${accent}55`
    }`,
    background: selected
      ? "linear-gradient(90deg, #facc15, #fde68a)"
      : disabled
        ? "rgba(148,163,184,0.06)"
        : `${accent}12`,
    color: selected ? "#020617" : "#e2e8f0",
    padding: "0.75rem",
    display: "flex",
    alignItems: "center",
    gap: "0.7rem",
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled && !selected ? 0.58 : 1,
    textAlign: "left",
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
    padding: "0.58rem 0.82rem",
    background: disabled ? "rgba(248,113,113,0.12)" : "rgba(127,29,29,0.25)",
    color: "#fecaca",
    cursor: disabled ? "not-allowed" : "pointer",
    fontWeight: 800,
    textTransform: "uppercase",
    letterSpacing: "0.07em",
    fontSize: "0.72rem",
  };
}
