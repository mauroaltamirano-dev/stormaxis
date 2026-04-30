# Tasks: Remodel Teams/Scrims UI/UX

## Phase 1: UI Foundation

- [x] 1.1 In `client/src/pages/Teams.tsx`, add page-local helpers for `SectionHeader`, `StatusChip`, `TeamBadge`, `MemberCard`, and `EmptyState` using existing `Team`/`TeamMember` types.
- [x] 1.2 In `client/src/pages/Scrims.tsx`, align existing helpers with the same visual language: chip colors, team badges, member cards, empty states, and button treatments.
- [x] 1.3 Add premium loading/skeleton components in both pages to replace the single flat loading panel.

## Phase 2: `/teams` Remodel

- [x] 2.1 Rebuild the top `/teams` content after `PageHeader` into a summary/command area showing team status, role, member count, online count, pending invites/requests, and quick link to `/scrims`.
- [x] 2.2 Remodel create/edit team profile forms with grouped visual sections, availability chips, clearer owner-only copy, and consistent disabled/saving states.
- [x] 2.3 Remodel roster cards to show avatar/logo fallback, online/offline/bot status, permission role, competitive role, rank/MMR, and owner role select without changing `assignRole`.
- [x] 2.4 Remodel invitations, sent requests, incoming requests, and team directory into premium action cards with helpful empty states and unchanged handlers.

## Phase 3: `/scrims` Remodel

- [x] 3.1 Rework `/scrims` command grid so “Mi equipo”, “Buscar partida”, and current published search state communicate readiness at a glance.
- [x] 3.2 Polish `RosterPicker` cards and role toggles with clearer selected/disabled/online/bot states while preserving starter/coach/observer validation.
- [x] 3.3 Remodel incoming challenge cards to show both teams, matchroom consequence, and clear accept/decline actions without changing `acceptChallenge`/`declineChallenge`.
- [x] 3.4 Remodel catalog and outgoing challenges with stronger room cards, MMR/roster metadata, disabled reason copy, and helpful empty states.

## Phase 4: Responsive and Accessibility Polish

- [x] 4.1 Update style maps in `Teams.tsx` and `Scrims.tsx` to use responsive grids with `auto-fit/minmax`, `clamp`, wrapping action rows, and no horizontal scroll at 375px.
- [x] 4.2 Add visible focus/hover/active states to clickable buttons/cards/role toggles and keep color contrast readable against Nexus dark backgrounds.
- [x] 4.3 If needed, update `client/src/components/PageHeader.tsx` only for mobile wrapping of header actions/stats.

## Phase 5: Verification

- [x] 5.1 Run `npm run typecheck` and fix any TypeScript regressions from UI helper props or style changes.
- [x] 5.2 Run `npm run check` and fix build/CSS issues.
- [x] 5.3 Manually smoke `/teams` and `/scrims` for spec scenarios: loading, empty, disabled, success/error feedback, and action wiring.
- [x] 5.4 Manually check responsive layouts at 375px, 768px, 1024px, and desktop.
