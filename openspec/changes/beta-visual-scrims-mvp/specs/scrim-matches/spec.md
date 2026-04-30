# Scrim Matches Specification

## Purpose
Allow admins to create closed-beta team-vs-team scrims that reuse the competitive matchroom and produce a persistent match record.

## Requirements

### Requirement: Admin Scrim Creation
The system MUST allow an ADMIN to create a `TEAM` match with two named teams, captains, and players/placeholders.

#### Scenario: Admin creates valid scrim
- GIVEN an admin selects Team A, Team B, captains, and rosters
- WHEN they submit the scrim form
- THEN the system creates a match in `VETOING` or ready-to-veto state
- AND returns a matchroom link.

#### Scenario: Missing captains are rejected
- GIVEN a scrim request lacks one captain per side
- WHEN the admin submits it
- THEN the system rejects the request with a validation error.

### Requirement: Scrim Matchroom Identity
The system MUST show scrim team names instead of generic Team 1/Team 2 where scrim metadata exists.

#### Scenario: Scrim participants open room
- GIVEN a `TEAM` match has scrim metadata
- WHEN a participant opens `/match/:id`
- THEN they see the named teams, captains, roster, map/veto state, replay, and result flow.

### Requirement: Scrim Results Record
The system MUST persist scrim results through the existing replay/vote/MVP completion flow.

#### Scenario: Scrim completes
- GIVEN a scrim reaches voting or replay resolution
- WHEN a winner and MVP are resolved
- THEN the match is marked `COMPLETED`
- AND history/admin views identify it as a scrim.

### Requirement: Beta Scope Boundary
The system MUST NOT require full team/clan membership for beta scrims.

#### Scenario: Team entity does not exist yet
- GIVEN a beta scrim uses free-form team names
- WHEN the match is created
- THEN it remains valid without friends, clans, seasons, or tournament brackets.
