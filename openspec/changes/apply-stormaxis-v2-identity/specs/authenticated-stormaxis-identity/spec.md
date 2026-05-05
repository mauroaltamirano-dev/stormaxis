# Authenticated StormAxis Identity Specification

## Purpose
Define the visual contract for authenticated pages so users experience a consistent StormAxis V2 design language across dashboard-adjacent workflows.

## Requirements

### Requirement: Unified Authenticated Visual Language
The system MUST render authenticated pages with consistent StormAxis V2 surfaces, typography, chips, controls, and feedback states.

#### Scenario: User navigates across authenticated pages
- GIVEN an authenticated user moves between dashboard, teams, scrims, stats, heroes, leaderboard, and profile
- WHEN each page renders
- THEN the page MUST use the same core visual language (panel surfaces, accent system, rounded cards, button style, status chips)
- AND visual transitions SHOULD feel like one continuous product, not isolated themes.

### Requirement: Shared Header and Surface Patterns
The system MUST provide reusable header/surface primitives used by route pages and shared components.

#### Scenario: Page header consistency
- GIVEN a page uses the shared header component
- WHEN title, eyebrow, actions, and stats render
- THEN spacing, hierarchy, and color treatment MUST align with StormAxis V2 conventions.

### Requirement: Preserve Existing Functional Contracts
The UI migration MUST NOT change business behavior.

#### Scenario: Existing route actions remain intact
- GIVEN any migrated authenticated page
- WHEN users execute existing actions (queue, profile save, team/scrim actions, filters/navigation)
- THEN the same API routes, socket events, state transitions, and route targets MUST be preserved.
