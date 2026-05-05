# Friends & Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add friend requests, mutual friends, actionable notifications, and contextual team invite/join request actions.

**Architecture:** Backend owns friendship state via a `FriendRequest` lifecycle and exposes a notification feed that aggregates friend requests plus existing team invite/join-request data. Frontend consumes the feed through a global bell component and adds contextual actions to player/team profiles.

**Tech Stack:** Prisma/PostgreSQL, Express routers/services, React 19, TanStack Router, Axios.

---

### Task 1: Backend friendship model and tests
**Files:** `server/prisma/schema.prisma`, `server/prisma/migrations/20260504190000_add_friend_requests/migration.sql`, `server/src/modules/friends/friends.service.test.ts`
- [x] Add `FriendRequestStatus` enum and `FriendRequest` model with directional sender/recipient relations.
- [x] Write tests for sending, duplicate prevention, accepting, cancelling, removing, and listing mutual friends.
- [x] Run `npx tsx --test server/src/modules/friends/friends.service.test.ts` and confirm missing implementation failures.

### Task 2: Backend friends service/router
**Files:** `server/src/modules/friends/friends.service.ts`, `server/src/modules/friends/friends.router.ts`, `server/src/infrastructure/http/app.ts`
- [x] Implement `listMyFriends`, `getFriendStatusByUsername`, `sendFriendRequest`, `respondToFriendRequest`, `cancelFriendRequest`, `removeFriend`.
- [x] Mount `/api/friends`.
- [x] Run friends tests and server typecheck.

### Task 3: Notification feed
**Files:** `server/src/modules/notifications/notifications.service.ts`, `server/src/modules/notifications/notifications.router.ts`, `server/src/infrastructure/http/app.ts`
- [x] Aggregate pending incoming friend requests, pending team invites, and incoming team join requests for managers.
- [x] Mount `/api/notifications`.
- [x] Add tests if time allows, otherwise verify through typecheck and existing team/friend service tests.

### Task 4: Global bell component
**Files:** `client/src/components/NotificationBell.tsx`, `client/src/pages/Dashboard.tsx`, `client/src/styles/stormaxis-v2.css`
- [x] Move mock Dashboard bell to reusable component backed by `/notifications`.
- [x] Friend request notifications show accept/reject buttons.
- [x] Team invite notifications link to `/teams/$slug`.
- [x] Increase bell to match the user card height.

### Task 5: Profile friendship UI
**Files:** `client/src/pages/Profile.tsx`
- [x] Public profile header shows friend action when not own profile.
- [x] Own profile sidebar below profile search shows friends plus outgoing/incoming pending requests.
- [x] Wire send/cancel/accept/decline/remove actions to `/friends`.

### Task 6: Team profile invite/join contextual UI
**Files:** `server/src/modules/teams/teams.service.ts`, `client/src/pages/TeamPublicProfile.tsx`
- [x] Public team payload includes viewer pending invite/join request.
- [x] Show invite panel with accept/reject if invited.
- [x] Show request button if no team and no pending request.
- [x] Show disabled pending state with clock if request exists.

### Task 7: Verification
- [x] Run `npm run test --workspace=server`.
- [x] Run `npm run typecheck --workspace=server`.
- [x] Run `npm run typecheck --workspace=client`.
- [x] Run `npm run build --workspace=client`.
