# Teams/Scrims Premium UI Specification

## Purpose
Define the UI/UX presentation contract for the `/teams` and `/scrims` pages so the existing Teams/Scrims v1 flows feel premium, readable, responsive, and operationally clear without changing backend behavior.

## Requirements

### Requirement: Command Center Visual Hierarchy

The system MUST present `/teams` and `/scrims` as premium esports command-center pages with clear primary task zones, visual hierarchy, and low text clutter.

#### Scenario: Teams hub communicates current state

- GIVEN a user opens `/teams`
- WHEN the hub data loads
- THEN the page MUST make the user's team status immediately visible
- AND roster, invites, join requests, owner controls, and directory actions MUST be separated into scannable modules
- AND critical counts/statuses SHOULD be represented with badges or stat cards rather than plain paragraphs.

#### Scenario: Scrims page communicates match readiness

- GIVEN a user with a team opens `/scrims`
- WHEN the scrim data loads
- THEN the page MUST make publish/search/challenge readiness visible without reading every card
- AND the current team state, roster selection state, incoming challenges, catalog, and outbox MUST be visually distinct.

### Requirement: Consistent Status and Role Language

The system MUST use consistent chips, badges, colors, icons, and Spanish labels for permission roles, competitive roles, online states, bot states, searches, and challenges.

#### Scenario: Member role visibility

- GIVEN a team member appears in `/teams` or `/scrims`
- WHEN the card renders
- THEN permission role and competitive role MUST be visible in consistent chip or metadata form
- AND online/offline/bot state MUST be visually distinguishable.

#### Scenario: Disabled action clarity

- GIVEN an action is unavailable because of permissions, missing team, missing published search, or incomplete roster
- WHEN the user sees the action
- THEN the UI MUST show a disabled state or explanatory copy that makes the reason clear.

### Requirement: Polished Feedback States

The system MUST provide polished loading, refreshing, empty, success, error, and pending states for both pages.

#### Scenario: Initial load

- GIVEN `/teams` or `/scrims` is fetching initial data
- WHEN the request is pending
- THEN the page SHOULD show a premium loading/skeleton treatment instead of a single flat text panel.

#### Scenario: Empty collections

- GIVEN there are no invites, requests, rival scrim rooms, outgoing challenges, or available teams
- WHEN the relevant section renders
- THEN the section MUST show a helpful empty state with context and next action where applicable
- AND it MUST NOT appear broken or abandoned.

#### Scenario: Action result

- GIVEN the user completes or fails an action
- WHEN success or error feedback appears
- THEN the feedback MUST use consistent visual styling and copy
- AND it MUST not obscure the main action flow.

### Requirement: Responsive Operational Layout

The system MUST remain usable and readable at mobile, tablet, laptop, and desktop widths.

#### Scenario: Mobile viewport

- GIVEN the viewport is approximately 375px wide
- WHEN `/teams` or `/scrims` renders
- THEN multi-column layouts MUST collapse to one column
- AND buttons, inputs, member cards, and challenge cards MUST remain tappable without horizontal scrolling.

#### Scenario: Tablet and desktop viewports

- GIVEN the viewport is approximately 768px, 1024px, or desktop width
- WHEN `/teams` or `/scrims` renders
- THEN high-priority operational modules SHOULD use two-column or grid layouts where space permits
- AND low-priority lists SHOULD not dominate the first screen.

### Requirement: Preserve Functional Contracts

The UI remodel MUST preserve existing data fetching, socket refresh events, route navigation, API actions, permission checks, and validation rules.

#### Scenario: Teams actions remain wired

- GIVEN the remodeled `/teams` page
- WHEN users create/edit teams, invite users, respond to invites, request/cancel joins, respond to join requests, or assign competitive roles
- THEN the page MUST call the same existing API endpoints and refresh behavior as before.

#### Scenario: Scrims actions remain wired

- GIVEN the remodeled `/scrims` page
- WHEN users publish a search, challenge a room, accept/decline a challenge, or navigate to matchroom
- THEN the page MUST call the same existing API endpoints and navigation behavior as before.
