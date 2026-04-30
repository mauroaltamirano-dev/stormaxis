# Team Management Specification

## Purpose
Allow beta users to organize into persistent teams with leader-controlled invites and permissions.

## Requirements

### Requirement: Team Creation
The system MUST allow an authenticated user without an active team to create one team and become its owner.

#### Scenario: User creates first team
- GIVEN a user has no active team
- WHEN they submit a valid team name
- THEN a team is created
- AND the user is added as `OWNER`.

#### Scenario: User already has active team
- GIVEN a user belongs to an active team
- WHEN they try to create another team
- THEN the request is rejected.

### Requirement: Team Invites
The system MUST let owners/captains invite users and let invitees accept or decline.

#### Scenario: Invite accepted
- GIVEN a pending team invite
- WHEN the invited user accepts
- THEN they become an active `MEMBER`
- AND the invite becomes `ACCEPTED`.

#### Scenario: Invite invalid for existing member
- GIVEN an invited user already belongs to an active team
- WHEN they accept the invite
- THEN the system rejects the acceptance.

### Requirement: Team Permissions
The system MUST restrict team management and scrim actions to `OWNER` or `CAPTAIN` roles.

#### Scenario: Member views team
- GIVEN a member opens the team area
- WHEN they are not owner/captain
- THEN they can view roster state
- AND cannot invite users or publish scrim searches.

#### Scenario: Leader removes member
- GIVEN an owner or captain manages an active team
- WHEN they remove an eligible member
- THEN the member status becomes `KICKED`
- AND the removed user no longer appears as an active team member.

#### Scenario: Captain cannot remove leader roles
- GIVEN a captain manages an active team
- WHEN they try to remove an owner or another captain
- THEN the system rejects the action.
