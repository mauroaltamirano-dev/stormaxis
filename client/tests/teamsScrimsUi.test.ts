import assert from "node:assert/strict";
import test from "node:test";

import {
  computeTeamHubSnapshot,
  computeScrimCommandSnapshot,
  computeScrimCommandCenter,
  getScrimChallengeActionState,
  getTeamsEntryPath,
  getTeamPublicPath,
  canShowTeamSettings,
  filterTeamDirectory,
  summarizePublicTeamStats,
  getSelectedPlayerRoles,
} from "../src/pages/teamsScrimsUi";

test("computeTeamHubSnapshot returns status counts for team owners", () => {
  const snapshot = computeTeamHubSnapshot({
    hasTeam: true,
    myRole: "OWNER",
    memberCount: 8,
    onlineCount: 5,
    pendingInvites: 2,
    pendingIncomingRequests: 3,
    pendingSentRequests: 1,
  });

  assert.equal(snapshot.teamStatusLabel, "Activo");
  assert.equal(snapshot.commandLabel, "Gestión completa");
  assert.deepEqual(snapshot.stats, [
    { label: "Miembros", value: "8" },
    { label: "Online", value: "5" },
    { label: "Invites", value: "2" },
    { label: "Solicitudes", value: "3" },
  ]);
});

test("computeTeamHubSnapshot returns no-team state for free agent users", () => {
  const snapshot = computeTeamHubSnapshot({
    hasTeam: false,
    myRole: null,
    memberCount: 0,
    onlineCount: 0,
    pendingInvites: 0,
    pendingIncomingRequests: 0,
    pendingSentRequests: 2,
  });

  assert.equal(snapshot.teamStatusLabel, "Sin equipo");
  assert.equal(snapshot.commandLabel, "Reclutamiento");
  assert.deepEqual(snapshot.stats[0], { label: "Pendientes", value: "2" });
});

test("computeScrimCommandSnapshot returns ready state when roster and permissions are valid", () => {
  const snapshot = computeScrimCommandSnapshot({
    hasTeam: true,
    canManage: true,
    hasPublishedSearch: true,
    startersSelected: 5,
    incomingChallenges: 1,
    outgoingChallenges: 2,
    openCatalogRooms: 7,
  });

  assert.equal(snapshot.readinessLabel, "Listo para desafiar");
  assert.equal(snapshot.badgeTone, "success");
  assert.deepEqual(snapshot.stats, [
    { label: "Entrantes", value: "1" },
    { label: "Salientes", value: "2" },
    { label: "Catálogo", value: "7" },
  ]);
});

test("computeScrimCommandSnapshot returns setup state when roster is incomplete", () => {
  const snapshot = computeScrimCommandSnapshot({
    hasTeam: true,
    canManage: true,
    hasPublishedSearch: false,
    startersSelected: 3,
    incomingChallenges: 0,
    outgoingChallenges: 0,
    openCatalogRooms: 4,
  });

  assert.equal(snapshot.readinessLabel, "Configura 5 titulares");
  assert.equal(snapshot.badgeTone, "warn");
});

test("computeScrimCommandCenter summarizes SCRIMS command center state", () => {
  const snapshot = computeScrimCommandCenter({
    hasTeam: true,
    canManage: true,
    hasPublishedSearch: false,
    startersSelected: 4,
    incomingChallenges: 2,
    outgoingChallenges: 1,
    openCatalogRooms: 6,
  });

  assert.equal(snapshot.headline, "Falta 1 titular");
  assert.equal(snapshot.progressLabel, "4/5 titulares");
  assert.equal(snapshot.tone, "warn");
  assert.deepEqual(snapshot.metrics, [
    { label: "Readiness", value: "Configura 5 titulares" },
    { label: "Rivales", value: "6" },
    { label: "Entrantes", value: "2" },
    { label: "Salientes", value: "1" },
  ]);
});

test("getScrimChallengeActionState explains disabled reasons", () => {
  assert.deepEqual(
    getScrimChallengeActionState({ hasTeam: false, canManage: false, hasPublishedSearch: false }),
    { disabled: true, label: "Necesitas equipo", hint: "Ve a /teams para ver o crear tu escuadra." },
  );

  assert.deepEqual(
    getScrimChallengeActionState({ hasTeam: true, canManage: false, hasPublishedSearch: false }),
    { disabled: true, label: "Sin permisos", hint: "Solo owner o captain puede desafiar." },
  );

  assert.deepEqual(
    getScrimChallengeActionState({ hasTeam: true, canManage: true, hasPublishedSearch: false }),
    { disabled: true, label: "Publica tu sala", hint: "Primero publica búsqueda para habilitar retos." },
  );

  assert.deepEqual(
    getScrimChallengeActionState({ hasTeam: true, canManage: true, hasPublishedSearch: true }),
    { disabled: false, label: "Enviar solicitud", hint: "Reto listo para enviar." },
  );
});


test("getTeamPublicPath builds encoded public team route", () => {
  assert.equal(getTeamPublicPath("storm-alpha"), "/teams/storm-alpha");
  assert.equal(getTeamPublicPath("Storm Alpha"), "/teams/Storm%20Alpha");
});

test("getTeamsEntryPath opens own public team profile when available", () => {
  assert.equal(getTeamsEntryPath({ slug: "storm-alpha" }), "/teams/storm-alpha");
  assert.equal(getTeamsEntryPath({ slug: "Storm Alpha" }), "/teams/Storm%20Alpha");
  assert.equal(getTeamsEntryPath(null), null);
  assert.equal(getTeamsEntryPath({ slug: "  " }), null);
});

test("filterTeamDirectory matches team name, description, owner, and member usernames", () => {
  const teams = [
    {
      id: "team-1",
      name: "Storm Alpha",
      slug: "storm-alpha",
      description: "Aggressive scrim squad",
      members: [
        { role: "OWNER", user: { username: "Luna" } },
        { role: "MEMBER", user: { username: "TankMain" } },
      ],
    },
    {
      id: "team-2",
      name: "Nexus Beta",
      slug: "nexus-beta",
      description: "Macro focused",
      members: [{ role: "OWNER", user: { username: "Kappa" } }],
    },
  ];

  assert.deepEqual(filterTeamDirectory(teams, "alpha").map((team) => team.id), ["team-1"]);
  assert.deepEqual(filterTeamDirectory(teams, "kappa").map((team) => team.id), ["team-2"]);
  assert.deepEqual(filterTeamDirectory(teams, "").map((team) => team.id), ["team-1", "team-2"]);
});

test("canShowTeamSettings only exposes settings to owners", () => {
  assert.equal(canShowTeamSettings("OWNER"), true);
  assert.equal(canShowTeamSettings("CAPTAIN"), false);
  assert.equal(canShowTeamSettings("MEMBER"), false);
  assert.equal(canShowTeamSettings(null), false);
});

test("summarizePublicTeamStats returns FACEIT-style public stat cards", () => {
  const summary = summarizePublicTeamStats({
    totalMatches: 23,
    wins: 13,
    losses: 10,
    winrate: 57,
    recentResults: ["W", "W", "L", "W", "W"],
  });

  assert.deepEqual(summary, [
    { label: "Total de partidas", value: "23" },
    { label: "Porcentaje ganado", value: "57%" },
    { label: "Victorias", value: "13" },
    { label: "Resultados recientes", value: "W W L W W" },
  ]);
});

test("getSelectedPlayerRoles returns selected unique player roles in display order", () => {
  assert.deepEqual(getSelectedPlayerRoles("HEALER", "FLEX"), ["HEALER", "FLEX"]);
  assert.deepEqual(getSelectedPlayerRoles("TANK", "TANK"), ["TANK"]);
  assert.deepEqual(getSelectedPlayerRoles(null, "RANGED"), ["RANGED"]);
  assert.deepEqual(getSelectedPlayerRoles(undefined, null), []);
});
