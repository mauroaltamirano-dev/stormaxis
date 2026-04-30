# Proposal: Remodel Teams/Scrims UI/UX

## Intent
Close the high-priority Teams/Scrims polish pass from `STORMAXIS_MASTER_PLAN.md`: make `/teams` and `/scrims` feel like a premium esports command center while preserving the working v1 flows.

## Scope

### In Scope
- Remodel `/teams` hierarchy: team identity, roster, invites/requests, directory, and owner controls.
- Polish `/scrims` command flow: roster selection, published search, challenges, catalog, outbox.
- Add consistent visual language: chips, status badges, cards, empty/loading/skeleton states, icons, responsive grids.
- Keep Spanish UX copy and Nexus dark esports identity.

### Out of Scope
- Backend/API/schema changes.
- Calendar/scheduled scrims.
- Scrim history/analytics.
- New social/friends flows.

## Capabilities

### New Capabilities
- `teams-scrims-premium-ui`: Presentation and interaction quality contract for Teams/Scrims pages.

### Modified Capabilities
- None.

## Approach
Refactor the two route pages with shared/local presentation primitives where useful, keeping existing data fetching, socket events, actions, and permission logic intact. Prioritize Approach 2 from exploration: command-center UI consistency without product-flow rewrites.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `client/src/pages/Teams.tsx` | Modified | Premium team hub layout and states. |
| `client/src/pages/Scrims.tsx` | Modified | Premium scrim command/catalog layout and states. |
| `client/src/components/PageHeader.tsx` | Modified optional | Only if needed for responsive/action polish. |
| `client/src/index.css` | Modified optional | Only for reusable animations/tokens. |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Visual refactor breaks action wiring | Med | Preserve function names/handlers; typecheck and smoke core flows. |
| Mobile layout regressions | Med | Explicit breakpoints/checklist for 375/768/1024/desktop. |
| Over-styled UI hurts readability | Low | Use restrained glow, maintain contrast, support reduced motion. |

## Rollback Plan
Revert this change folder and the UI-only commit; no database or backend rollback required.

## Dependencies
- Existing Teams/Scrims v1 APIs and socket events remain available.

## Success Criteria
- [ ] `/teams` communicates team status, roster roles, requests, and directory actions at a glance.
- [ ] `/scrims` makes publish/challenge/accept states visually obvious.
- [ ] Loading, empty, disabled, error, and success states are polished.
- [ ] Layout remains usable at 375px, 768px, 1024px, and desktop.
- [ ] `npm run typecheck` and `npm run check` pass after implementation.
