# Design: Apply StormAxis V2 Identity Across Authenticated App

## Technical Approach
Implement a style-system-first migration:
1. Expand `stormaxis-v2.css` with reusable primitives (`storm-page`, `storm-surface`, `storm-card`, `storm-chip`, `storm-btn`, `storm-empty`, etc.).
2. Update shared components (`PageHeader`) to consume those primitives.
3. Restyle target routes by attaching new classNames and adjusting key inline style constants to match the new identity.

## Architecture Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Scope boundary | Authenticated pages only | Fastest way to maximize consistency where users spend most time. |
| Migration strategy | Hybrid class + existing inline style constants | Large pages can be migrated safely without high-risk rewrites. |
| Behavior constraints | UI-only modifications | Existing API/socket/store behavior is already functional and should remain stable. |
| Styling source of truth | Dashboard V2 StormAxis identity | User explicitly selected Dashboard style as canonical design language. |

## Data Flow
No data-flow changes. All endpoints, sockets, state transitions, and navigation remain the same.

## File Changes
- `client/src/styles/stormaxis-v2.css`
- `client/src/components/PageHeader.tsx`
- `client/src/pages/Teams.tsx`
- `client/src/pages/Scrims.tsx`
- `client/src/pages/Stats.tsx`
- `client/src/pages/Heroes.tsx`
- `client/src/pages/Leaderboard.tsx`
- `client/src/pages/Profile.tsx`

## Testing Strategy
- `npm run typecheck --workspace=client`
- `npm run check`
- Targeted lint on touched files
- Manual smoke on `/teams`, `/scrims`, `/stats`, `/heroes`, `/leaderboard`, `/profile`, plus dashboard navigation continuity

## Rollout
Single frontend rollout; no backend coordination required.
