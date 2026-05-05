# Teams UX + Public Profile Design

## Context
`/teams` currently mixes the user team management form, roster, recruiting, directory, requests, and operational summary in one flow. Team directory cards are not linked to public team pages, and there is no `/teams/$slug` frontend route or `GET /teams/:slug` backend route yet.

## Goal
Make `/teams` a clearer team hub before beta: a public-profile preview first, separate management panels, explicit invite/team search inputs, and clickable teams that route to a public team URL.

## Recommended Approach
Implement a focused end-to-end public team profile slice and reorganize `/teams` around it.

### Route + Data
- Add `GET /teams/public/:slug` returning an active team by slug with public-safe fields: id, name, slug, logo/banner, description, availabilityDays, active members with public user fields only.
- Add frontend route `/teams/$slug` rendering a read-only public team profile.
- Directory cards link to `/teams/${team.slug}`.

### `/teams` layout
1. **Public profile preview** at the top:
   - Shows banner/logo/name/description/availability/member count.
   - CTA: `Ver perfil público` linking to `/teams/$slug`.
   - If no team, shows free-agent state and CTA to create/join.
2. **Main two-column layout**:
   - Left column: `Configurar equipo` panel (owner-only editable form; non-owner read-only info).
   - Left/center: `Jugadores del equipo` panel with roster list/cards and role assignment.
   - Right column: `Invitar jugadores` panel with search input and explicit invite buttons.
   - Right/lower: `Buscar equipos` panel with search input filtering directory cards client-side.
3. **Requests panels** remain below/side but visually secondary.

### Interaction rules
- Team names/cards in directory are clickable to their public profile.
- User/player names remain clickable via `PlayerLink`.
- Search result rows are not fake buttons; only explicit CTAs are buttons.
- Disabled actions use shared `Button` disabled states.

### Testing
- Add pure helper tests for team public path and client-side directory filter.
- Add server service/router tests for `getPublicTeamBySlug` if feasible with existing patterns.
- Run targeted tests and `npm run check`.
