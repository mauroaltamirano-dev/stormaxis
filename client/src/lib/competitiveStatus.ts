export type QueueLifecycleInput = {
  hasActiveMatch: boolean;
  isAccepting: boolean;
  isSearching: boolean;
  queueEtaSeconds: number | null;
  queuePosition: number | null;
  acceptedCount: number;
  totalPlayers: number;
};

export type MatchLifecycleStatus =
  | "ACCEPTING"
  | "VETOING"
  | "PLAYING"
  | "VOTING"
  | "COMPLETED"
  | "CANCELLED"
  | "PENDING";

export type CompetitiveStatusMeta = {
  phase: string;
  stage: string | null;
  detail: string;
  signal: string;
  navLabel: string;
  navDetail: string;
  tone: string;
};

export function getQueueLifecycleMeta({
  hasActiveMatch,
  isAccepting,
  isSearching,
  queueEtaSeconds,
  queuePosition,
  acceptedCount,
  totalPlayers,
}: QueueLifecycleInput): CompetitiveStatusMeta {
  if (hasActiveMatch) {
    return {
      phase: "SALA ACTIVA",
      stage: "Operativa",
      detail: "Tenés una sala competitiva viva esperando continuidad.",
      signal: "Dentro del circuito",
      navLabel: "Sala activa",
      navDetail: "Volvé al room para seguir el flujo.",
      tone: "#22c55e",
    };
  }

  if (isAccepting) {
    return {
      phase: "CONFIRMANDO",
      stage: "Accept",
      detail: `Aceptaron ${acceptedCount}/${totalPlayers}. Falta cerrar la ventana de confirmación.`,
      signal: "Lobby bloqueado",
      navLabel: "Confirmando",
      navDetail: `Accept ${acceptedCount}/${totalPlayers}`,
      tone: acceptedCount === totalPlayers ? "#22c55e" : "#fbbf24",
    };
  }

  if (isSearching) {
    return {
      phase: "EN COLA",
      stage: "Matchmaking",
      detail:
        queuePosition != null
          ? `Posición ${queuePosition} · ETA ${queueEtaSeconds != null ? `~${queueEtaSeconds}s` : "calculando"}`
          : "Buscando escuadra compatible y balance de MMR.",
      signal: "Buscando 10 jugadores",
      navLabel: "En cola",
      navDetail:
        queuePosition != null
          ? `Pos. ${queuePosition}${queueEtaSeconds != null ? ` · ~${queueEtaSeconds}s` : ""}`
          : "Buscando lobby",
      tone: "#38bdf8",
    };
  }

  return {
    phase: "LISTO",
    stage: "Standby",
    detail: "Tu perfil competitivo está preparado para entrar a cola.",
    signal: "Esperando acción",
    navLabel: "Listo",
    navDetail: "Disponible para buscar partida.",
    tone: "#cbd5e1",
  };
}

export function getMatchLifecycleMeta(
  status: MatchLifecycleStatus,
  allConnected: boolean,
): CompetitiveStatusMeta {
  if (status === "VETOING") {
    return {
      phase: "SALA ACTIVA",
      stage: "Veto",
      detail: "Capitanes definiendo mapa y orden táctico.",
      signal: "Turno de veto",
      navLabel: "Sala activa",
      navDetail: "Veto en curso",
      tone: "#7dd3fc",
    };
  }

  if (status === "PLAYING") {
    return allConnected
      ? {
          phase: "SALA ACTIVA",
          stage: "Cierre",
          detail: "Esperando confirmación de capitanes para finalizar.",
          signal: "Lista para cerrar",
          navLabel: "Sala activa",
          navDetail: "Cierre de partida",
          tone: "#fbbf24",
        }
      : {
          phase: "SALA ACTIVA",
          stage: "Conectando",
          detail: "Lobby abierta, falta confirmar presencia de todos.",
          signal: "Ingreso a partida",
          navLabel: "Sala activa",
          navDetail: "Jugadores conectando",
          tone: "#38bdf8",
        };
  }

  if (status === "VOTING") {
    return {
      phase: "SALA ACTIVA",
      stage: "Votación",
      detail: "Los diez jugadores validan el resultado final.",
      signal: "Resultado en validación",
      navLabel: "Sala activa",
      navDetail: "Votación de ganador",
      tone: "#c084fc",
    };
  }

  if (status === "COMPLETED") {
    return {
      phase: "FINALIZADA",
      stage: "Resultado",
      detail: "MMR aplicado y resultado consolidado.",
      signal: "Partida cerrada",
      navLabel: "Finalizada",
      navDetail: "Resultado consolidado",
      tone: "#4ade80",
    };
  }

  if (status === "CANCELLED") {
    return {
      phase: "CANCELADA",
      stage: "Abortada",
      detail: "El flujo se detuvo antes del cierre competitivo.",
      signal: "Sesión abortada",
      navLabel: "Cancelada",
      navDetail: "Match detenida",
      tone: "#fda4af",
    };
  }

  return {
    phase: "CONFIRMANDO",
    stage: "Accept",
    detail: "Esperando confirmación global de la lobby.",
    signal: "Lobby bloqueado",
    navLabel: "Confirmando",
    navDetail: "Accept en curso",
    tone: "#fbbf24",
  };
}
