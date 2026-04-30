# Design: Remodel Teams/Scrims UI/UX

## Technical Approach

Implement a UI-only remodel of `client/src/pages/Teams.tsx` and `client/src/pages/Scrims.tsx`. Preserve existing API calls, socket listeners, permission booleans, and action handlers. Improve presentation by adding small page-local primitives for hero summaries, section headers, status chips, team/member cards, empty states, skeletons, and responsive grids. The design follows the new `teams-scrims-premium-ui` spec and existing Nexus dark esports tokens.

## Architecture Decisions

| Decision | Choice | Alternatives considered | Rationale |
|---|---|---|---|
| Scope boundary | UI-only in route pages | Backend/schema/API changes | Current Teams/Scrims behavior is working and smoke is still pending; visual polish should not destabilize contracts. |
| Component strategy | Page-local helpers first; extract later only if duplication becomes painful | Large shared component library now | Existing pages already use inline styles and local helpers; smaller localized changes reduce risk. |
| Visual language | Nexus cyber command center: cyan/gold/green/red chips, restrained glow, dense cards | Red/gold retro-futurism from generic search output | Current product already uses Nexus tokens and PageHeader; consistency beats introducing a new palette. |
| State handling | Keep current `useState`, derived `useMemo`, `refresh`, and `runAction` flow | Add new global store/query layer | React guidance favors deriving values where possible; no new data architecture is needed. |
| Responsiveness | CSS grid with `repeat(auto-fit/minmax())`, `clamp()`, and single-column fallbacks | Fixed desktop-first layouts | Must satisfy 375/768/1024/desktop usability without horizontal scroll. |

## Data Flow

Existing data flow remains unchanged:

```text
/teams route ──GET /teams/hub────┐
  actions ─────POST/PATCH teams──┤── refresh state ── render premium modules
  sockets ─────teams events──────┘

/scrims route ─GET /scrims────────┐
  actions ─────POST scrim APIs────┤── refresh/navigate ── render command flow
  sockets/poll ─scrim/team events─┘
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `client/src/pages/Teams.tsx` | Modify | Remodel layout, cards, roster/role display, invitations/requests/directory, loading/empty states, responsive style map. |
| `client/src/pages/Scrims.tsx` | Modify | Polish command grid, roster picker, published search, challenges, catalog, outbox, loading/empty states, responsive style map. |
| `client/src/components/PageHeader.tsx` | Modify optional | Only if header side/actions need better wrapping on mobile. |
| `client/src/index.css` | Modify optional | Only for reusable reduced-motion or subtle animation helpers. |

## Interfaces / Contracts

No backend contracts change. Existing TypeScript response types remain page-local:

```ts
// preserved examples
api.get<HubResponse>("/teams/hub")
api.get<ScrimsResponse>("/scrims")
socket.on("teams:updated", onRefresh)
socket.on("scrims:search_updated", onRefresh)
```

New UI helpers should accept existing page types (`Team`, `TeamMember`, `ScrimSearch`, `ScrimChallenge`) and avoid creating duplicate source-of-truth state.

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Type | Props, derived values, handlers still valid | `npm run typecheck` |
| Build | Vite production build and CSS validity | `npm run check` |
| Manual | `/teams` and `/scrims` at 375/768/1024/desktop; empty/loading/disabled/success/error states | Browser smoke after implementation |
| Regression | Core Teams/Scrims API behavior | Existing server tests if backend is accidentally touched; otherwise not required for UI-only diff |

## Migration / Rollout

No migration required. Ship as a UI-only frontend change. Rollback is a normal git revert of this implementation.

## Open Questions

None blocking. During implementation, prefer preserving current copy unless a shorter Spanish label improves scanability.
