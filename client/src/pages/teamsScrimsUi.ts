export type Metric = { label: string; value: string };

export type TeamHubSnapshotInput = {
  hasTeam: boolean;
  myRole: "OWNER" | "CAPTAIN" | "MEMBER" | null;
  memberCount: number;
  onlineCount: number;
  pendingInvites: number;
  pendingIncomingRequests: number;
  pendingSentRequests: number;
};

export type ScrimCommandSnapshotInput = {
  hasTeam: boolean;
  canManage: boolean;
  hasPublishedSearch: boolean;
  startersSelected: number;
  incomingChallenges: number;
  outgoingChallenges: number;
  openCatalogRooms: number;
};

export type ChallengeActionState = {
  disabled: boolean;
  label: string;
  hint: string;
};

export function computeTeamHubSnapshot(input: TeamHubSnapshotInput) {
  if (!input.hasTeam) {
    return {
      teamStatusLabel: "Sin equipo",
      commandLabel: "Reclutamiento",
      stats: [
        { label: "Pendientes", value: String(input.pendingSentRequests) },
        { label: "Invites", value: String(input.pendingInvites) },
      ] satisfies Metric[],
    };
  }

  const commandLabel = input.myRole === "OWNER" || input.myRole === "CAPTAIN"
    ? "Gestión completa"
    : "Roster activo";

  return {
    teamStatusLabel: "Activo",
    commandLabel,
    stats: [
      { label: "Miembros", value: String(input.memberCount) },
      { label: "Online", value: String(input.onlineCount) },
      { label: "Invites", value: String(input.pendingInvites) },
      { label: "Solicitudes", value: String(input.pendingIncomingRequests) },
    ] satisfies Metric[],
  };
}

export function computeScrimCommandSnapshot(input: ScrimCommandSnapshotInput) {
  if (!input.hasTeam) {
    return {
      readinessLabel: "Sin equipo",
      badgeTone: "danger" as const,
      stats: [
        { label: "Entrantes", value: "0" },
        { label: "Salientes", value: "0" },
        { label: "Catálogo", value: String(input.openCatalogRooms) },
      ] satisfies Metric[],
    };
  }

  if (!input.canManage) {
    return {
      readinessLabel: "Solo lectura",
      badgeTone: "muted" as const,
      stats: [
        { label: "Entrantes", value: String(input.incomingChallenges) },
        { label: "Salientes", value: String(input.outgoingChallenges) },
        { label: "Catálogo", value: String(input.openCatalogRooms) },
      ] satisfies Metric[],
    };
  }

  if (!input.hasPublishedSearch && input.startersSelected < 5) {
    return {
      readinessLabel: "Configura 5 titulares",
      badgeTone: "warn" as const,
      stats: [
        { label: "Entrantes", value: String(input.incomingChallenges) },
        { label: "Salientes", value: String(input.outgoingChallenges) },
        { label: "Catálogo", value: String(input.openCatalogRooms) },
      ] satisfies Metric[],
    };
  }

  return {
    readinessLabel: input.hasPublishedSearch ? "Listo para desafiar" : "Publica tu sala",
    badgeTone: input.hasPublishedSearch ? "success" as const : "info" as const,
    stats: [
      { label: "Entrantes", value: String(input.incomingChallenges) },
      { label: "Salientes", value: String(input.outgoingChallenges) },
      { label: "Catálogo", value: String(input.openCatalogRooms) },
    ] satisfies Metric[],
  };
}

export function getScrimChallengeActionState(input: {
  hasTeam: boolean;
  canManage: boolean;
  hasPublishedSearch: boolean;
}): ChallengeActionState {
  if (!input.hasTeam) {
    return {
      disabled: true,
      label: "Necesitas equipo",
      hint: "Ve a /teams para crear o unirte a uno.",
    };
  }

  if (!input.canManage) {
    return {
      disabled: true,
      label: "Sin permisos",
      hint: "Solo owner o captain puede desafiar.",
    };
  }

  if (!input.hasPublishedSearch) {
    return {
      disabled: true,
      label: "Publica tu sala",
      hint: "Primero publica búsqueda para habilitar retos.",
    };
  }

  return {
    disabled: false,
    label: "Enviar solicitud",
    hint: "Reto listo para enviar.",
  };
}
