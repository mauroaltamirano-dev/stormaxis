import assert from "node:assert/strict";
import test from "node:test";

import {
  computeTeamHubSnapshot,
  computeScrimCommandSnapshot,
  getScrimChallengeActionState,
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

test("getScrimChallengeActionState explains disabled reasons", () => {
  assert.deepEqual(
    getScrimChallengeActionState({ hasTeam: false, canManage: false, hasPublishedSearch: false }),
    { disabled: true, label: "Necesitas equipo", hint: "Ve a /teams para crear o unirte a uno." },
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
