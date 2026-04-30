# Self-Serve Scrims Specification

## Purpose
Let team leaders publish instant scrim searches, challenge other teams, and create tracked matches without admin intervention.

## Requirements

### Requirement: Scrim Search Creation
The system MUST let an owner/captain publish one active search by selecting 5 online starters, optional 1 coach, and up to 2 observers/substitutes.

#### Scenario: Valid search
- GIVEN a team has at least 5 online members
- WHEN the leader selects 5 starters and optional staff
- THEN an `OPEN` scrim search appears in `/scrims`.

#### Scenario: Missing online starters
- GIVEN fewer than 5 selected starters are online
- WHEN the leader submits the search
- THEN the system rejects it.

#### Scenario: Test bots fill missing starters
- GIVEN a team has at least 1 real starter online and admin-created bot members
- WHEN the leader selects the online real starter plus bot starters
- THEN the system allows publishing the search
- AND bots do not require online presence.

### Requirement: Scrim Catalog and Challenges
The system MUST show open searches and allow eligible team leaders to send, accept, or decline challenges.

#### Scenario: Challenge accepted
- GIVEN Team A and Team B have compatible open searches
- WHEN Team B accepts Team A's challenge
- THEN both searches close
- AND a `TEAM` match is created.

#### Scenario: Duplicate active search
- GIVEN a team already has an open search
- WHEN its leader tries to publish another
- THEN the system rejects it.

### Requirement: Match Participants and Staff Access
The system MUST create match players only for the 10 starters while granting coach/observer web and Discord access for their team.

#### Scenario: Match generated from challenge
- GIVEN an accepted challenge has 5 starters per side
- WHEN the match is created
- THEN only starters become `MatchPlayer` records
- AND coach/observers are saved as scrim access roles.

#### Scenario: Bot-assisted match generated from challenge
- GIVEN each accepted challenge side has at least 1 real starter online and bot starters filling the rest
- WHEN the match is created
- THEN bot starters become auto-accepted bot `MatchPlayer` records
- AND only real starters are counted in the human accept gate.

#### Scenario: Coach opens matchroom
- GIVEN a coach is assigned to a generated scrim
- WHEN they open the matchroom
- THEN they see coach identity in the web UI
- AND receive private team Discord access if Discord is linked.

#### Scenario: Observer opens matchroom
- GIVEN an observer/substitute is assigned to a generated scrim
- WHEN they open the matchroom
- THEN they can view the room and access team Discord
- AND they are not shown as a stat-bearing player.
