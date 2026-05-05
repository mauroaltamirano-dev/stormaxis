export type Metric = { label: string; value: string };
export type PlayerRoleKey = "RANGED" | "HEALER" | "OFFLANE" | "FLEX" | "TANK";

export type TeamDirectoryFilterItem = {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  members?: Array<{
    role?: string | null;
    user?: { username?: string | null } | null;
  }>;
};

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

export type ScrimCommandCenterInput = ScrimCommandSnapshotInput;

export type ScrimCommandCenterSnapshot = {
  headline: string;
  progressLabel: string;
  tone: "success" | "warn" | "info" | "muted" | "danger";
  metrics: Metric[];
};

export type PublicTeamStatsSummary = {
  totalMatches: number;
  wins: number;
  losses: number;
  winrate: number;
  recentResults: string[];
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

export function computeScrimCommandCenter(input: ScrimCommandCenterInput): ScrimCommandCenterSnapshot {
  const command = computeScrimCommandSnapshot(input);
  const missingStarters = Math.max(0, 5 - input.startersSelected);

  if (!input.hasTeam) {
    return {
      headline: "Crea una escuadra",
      progressLabel: "0/5 titulares",
      tone: "danger",
      metrics: [
        { label: "Readiness", value: command.readinessLabel },
        { label: "Rivales", value: String(input.openCatalogRooms) },
        { label: "Entrantes", value: "0" },
        { label: "Salientes", value: "0" },
      ],
    };
  }

  if (!input.canManage) {
    return {
      headline: "Modo observador",
      progressLabel: `${input.startersSelected}/5 titulares`,
      tone: "muted",
      metrics: [
        { label: "Readiness", value: command.readinessLabel },
        { label: "Rivales", value: String(input.openCatalogRooms) },
        { label: "Entrantes", value: String(input.incomingChallenges) },
        { label: "Salientes", value: String(input.outgoingChallenges) },
      ],
    };
  }

  if (input.hasPublishedSearch) {
    return {
      headline: "Sala en línea",
      progressLabel: "5/5 titulares",
      tone: "success",
      metrics: [
        { label: "Readiness", value: command.readinessLabel },
        { label: "Rivales", value: String(input.openCatalogRooms) },
        { label: "Entrantes", value: String(input.incomingChallenges) },
        { label: "Salientes", value: String(input.outgoingChallenges) },
      ],
    };
  }

  return {
    headline: missingStarters === 0 ? "Listo para publicar" : `Falta${missingStarters === 1 ? "" : "n"} ${missingStarters} titular${missingStarters === 1 ? "" : "es"}`,
    progressLabel: `${input.startersSelected}/5 titulares`,
    tone: missingStarters === 0 ? "info" : "warn",
    metrics: [
      { label: "Readiness", value: command.readinessLabel },
      { label: "Rivales", value: String(input.openCatalogRooms) },
      { label: "Entrantes", value: String(input.incomingChallenges) },
      { label: "Salientes", value: String(input.outgoingChallenges) },
    ],
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
      hint: "Ve a /teams para ver o crear tu escuadra.",
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

export function getTeamPublicPath(slug: string) {
  return `/teams/${encodeURIComponent(slug.trim())}`;
}

export function getTeamsEntryPath(team: { slug?: string | null } | null | undefined) {
  const slug = team?.slug?.trim();
  return slug ? getTeamPublicPath(slug) : null;
}

export function canShowTeamSettings(role: "OWNER" | "CAPTAIN" | "MEMBER" | null | undefined) {
  return role === "OWNER";
}

export function summarizePublicTeamStats(summary: PublicTeamStatsSummary): Metric[] {
  return [
    { label: "Total de partidas", value: String(summary.totalMatches) },
    { label: "Porcentaje ganado", value: `${summary.winrate}%` },
    { label: "Victorias", value: String(summary.wins) },
    { label: "Resultados recientes", value: summary.recentResults.join(" ") || "—" },
  ];
}

export function getSelectedPlayerRoles(
  mainRole?: PlayerRoleKey | null,
  secondaryRole?: PlayerRoleKey | null,
): PlayerRoleKey[] {
  return [mainRole, secondaryRole].filter((role, index, roles): role is PlayerRoleKey => (
    Boolean(role) && roles.indexOf(role) === index
  ));
}

export function filterTeamDirectory<T extends TeamDirectoryFilterItem>(teams: T[], query: string): T[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return teams;

  return teams.filter((team) => {
    const owner = team.members?.find((member) => member.role === "OWNER")?.user?.username ?? "";
    const memberNames = team.members?.map((member) => member.user?.username ?? "").join(" ") ?? "";
    const searchable = [team.name, team.slug, team.description ?? "", owner, memberNames].join(" ").toLowerCase();
    return searchable.includes(normalized);
  });
}
