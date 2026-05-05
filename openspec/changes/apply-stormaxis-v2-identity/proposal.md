# Proposal: Apply StormAxis V2 Identity Across Authenticated App

## Intent
Extend the Dashboard V2 visual identity to the rest of the authenticated frontend so the product feels like one cohesive command center.

## Scope

### In Scope
- Shared visual primitives/tokens in client styles for StormAxis V2.
- Shared component polish: `PageHeader`, reusable panel/button/chip states.
- Route-level UI restyling for: `/teams`, `/scrims`, `/stats`, `/heroes`, `/leaderboard`, `/profile`.
- Matchmaking adjacent polish for existing authenticated shell surfaces (without changing behavior).

### Out of Scope
- Landing, Login, Register, Onboarding visual redesign.
- Backend, API, database, Redis, socket contract changes.
- Feature logic changes (queue, profile actions, scrim rules, ranking calculations).

## Capabilities

### New Capabilities
- `authenticated-stormaxis-identity`: Unified visual language contract for authenticated pages.

### Modified Capabilities
- None.

## Approach
Create a reusable StormAxis visual layer and migrate page-local inline styling toward shared patterns while preserving all existing data, actions, sockets, and route behavior.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `client/src/styles/stormaxis-v2.css` | Modified | Adds reusable app-wide visual primitives for authenticated pages. |
| `client/src/components/PageHeader.tsx` | Modified | Moves to shared StormAxis header classes and consistent responsive behavior. |
| `client/src/pages/{Teams,Scrims,Stats,Heroes,Leaderboard,Profile}.tsx` | Modified | Adopts StormAxis classes/tone while preserving logic and handlers. |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| UI regressions from CSS overrides | Medium | Keep style changes additive and scoped under authenticated shell classes. |
| Behavior drift during restyle | Low/Med | Avoid touching API handlers/state transitions; run smoke checks per route. |
| Existing lint debt obscures regressions | Medium | Use targeted lint for touched files + repo typecheck/check. |

## Rollback Plan
Revert the UI commits for this change. No data migration or backend rollback is required.

## Success Criteria
- [ ] Authenticated pages share the same StormAxis visual identity as Dashboard V2.
- [ ] No API/state/socket behavior is changed.
- [ ] Typecheck and build checks pass.
