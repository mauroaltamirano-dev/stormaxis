# Team Public Profile FACEIT Remodel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remodelar el perfil público de equipos estilo FACEIT, agregar About/recruiting/redes, estadísticas públicas de scrims e implementar soft delete owner-only.

**Architecture:** Mantener el módulo `teams` como dueño del perfil y exponer estadísticas derivadas desde `Match` + `ScrimDetails`. El frontend concentra la nueva UX en `TeamPublicProfile.tsx` y usa helpers puros en `teamsScrimsUi.ts` para decisiones testeables. No se agrega librería de charts; se usa SVG simple.

**Tech Stack:** React 19 + TanStack Router, Express, Prisma/PostgreSQL, node:test.

---

### Task 1: Backend soft delete y campos públicos

**Files:**
- Modify: `server/prisma/schema.prisma`
- Create: `server/prisma/migrations/20260504120000_team_public_profile_about_soft_delete/migration.sql`
- Modify: `server/src/modules/teams/teams.service.ts`
- Modify: `server/src/modules/teams/teams.router.ts`
- Test: `server/src/modules/teams/teams.service.test.ts`

- [ ] Write failing tests for `deleteTeam` owner-only archiving.
- [ ] Run `npm run test --workspace=server -- --test-name-pattern deleteTeam` and verify failures.
- [ ] Add schema/migration fields, sanitizers, service and route.
- [ ] Re-run targeted server tests.

### Task 2: Backend public stats endpoint

**Files:**
- Modify: `server/src/modules/teams/teams.service.ts`
- Modify: `server/src/modules/teams/teams.router.ts`
- Test: `server/src/modules/teams/teams.service.test.ts`

- [ ] Write failing tests for `getPublicTeamStatsBySlug` summary/map/history pagination.
- [ ] Run targeted failing test.
- [ ] Implement query + derivation helpers.
- [ ] Re-run targeted server tests.

### Task 3: Frontend helpers

**Files:**
- Modify: `client/src/pages/teamsScrimsUi.ts`
- Test: `client/tests/teamsScrimsUi.test.ts`

- [ ] Write failing tests for `canShowTeamSettings` and public stat summary helpers.
- [ ] Run `npx tsx client/tests/teamsScrimsUi.test.ts` and verify failures.
- [ ] Implement helpers.
- [ ] Re-run client helper tests.

### Task 4: TeamPublicProfile remodel

**Files:**
- Replace/modify: `client/src/pages/TeamPublicProfile.tsx`

- [ ] Build FACEIT-style hero/tabs/general/statistics/settings.
- [ ] Wire `GET /teams/public/:slug`, `GET /teams/public/:slug/stats`, `PATCH /teams/:teamId`, `DELETE /teams/:teamId`.
- [ ] Use IntersectionObserver for loading 10 more history rows when sentinel enters viewport.
- [ ] Ensure logo has no double border and uses `objectFit: contain` in hero.

### Task 5: Teams hub compatibility

**Files:**
- Modify: `client/src/pages/Teams.tsx`
- Modify: `server/src/modules/teams/teams.service.ts`

- [ ] Ensure hub/public preview accepts new fields without breaking existing team creation/editing.
- [ ] Add soft delete navigation behavior back to `/teams` after archiving.

### Task 6: Verification

- [ ] Run `npx tsx client/tests/teamsScrimsUi.test.ts`.
- [ ] Run `npm run test --workspace=server -- --test-name-pattern "deleteTeam|getPublicTeamStatsBySlug|teams"`.
- [ ] Run `npm run check`.
