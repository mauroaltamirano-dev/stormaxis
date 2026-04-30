# Delta for Beta Visual MVP

## ADDED Requirements

### Requirement: Closed Beta Guidance
The system MUST explain the two beta play paths: random matchmaking and admin-created scrims.

#### Scenario: Tester sees beta paths
- GIVEN an authenticated onboarded tester
- WHEN they open `/dashboard`
- THEN they see a clear matchmaking path
- AND they see a scrim/team-vs-team path with beta copy.

### Requirement: Critical Route Polish
The system SHOULD provide coherent loading, empty, error, and responsive states for critical beta routes.

#### Scenario: Empty data does not look broken
- GIVEN a tester has little or no match history
- WHEN they open Profile, Stats, Hero Lab, or Leaderboard
- THEN the page shows intentional empty states and next actions.

#### Scenario: Matchroom remains usable on tablet/mobile
- GIVEN a tester opens a matchroom on a smaller viewport
- WHEN the match is in veto, playing, voting, or completed state
- THEN primary actions remain visible and non-overlapping.

## MODIFIED Requirements
None.

## REMOVED Requirements
None.
