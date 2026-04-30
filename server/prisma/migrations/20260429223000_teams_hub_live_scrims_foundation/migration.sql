-- Teams hub foundation: richer team profile, join requests, competitive roles, and explicit match origin.

CREATE TYPE "TeamCompetitiveRole" AS ENUM (
  'UNASSIGNED',
  'CAPTAIN',
  'STARTER',
  'SUBSTITUTE',
  'COACH',
  'STAFF'
);

CREATE TYPE "TeamJoinRequestStatus" AS ENUM (
  'PENDING',
  'ACCEPTED',
  'DECLINED',
  'CANCELLED',
  'EXPIRED'
);

CREATE TYPE "MatchOrigin" AS ENUM (
  'QUEUE',
  'SCRIM_SELF_SERVE',
  'SCRIM_ADMIN'
);

ALTER TABLE "Team"
  ADD COLUMN "bannerUrl" VARCHAR(500),
  ADD COLUMN "description" VARCHAR(500),
  ADD COLUMN "availabilityDays" JSONB;

ALTER TABLE "TeamMember"
  ADD COLUMN "competitiveRole" "TeamCompetitiveRole" NOT NULL DEFAULT 'UNASSIGNED';

CREATE INDEX "TeamMember_teamId_competitiveRole_status_idx"
  ON "TeamMember"("teamId", "competitiveRole", "status");

CREATE TABLE "TeamJoinRequest" (
  "id" TEXT NOT NULL,
  "teamId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "reviewedById" TEXT,
  "status" "TeamJoinRequestStatus" NOT NULL DEFAULT 'PENDING',
  "respondedAt" TIMESTAMP(3),
  "expiresAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TeamJoinRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TeamJoinRequest_teamId_status_idx" ON "TeamJoinRequest"("teamId", "status");
CREATE INDEX "TeamJoinRequest_userId_status_idx" ON "TeamJoinRequest"("userId", "status");

ALTER TABLE "TeamJoinRequest"
  ADD CONSTRAINT "TeamJoinRequest_teamId_fkey"
  FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TeamJoinRequest"
  ADD CONSTRAINT "TeamJoinRequest_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TeamJoinRequest"
  ADD CONSTRAINT "TeamJoinRequest_reviewedById_fkey"
  FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE UNIQUE INDEX "TeamJoinRequest_one_pending_per_team_user_key"
  ON "TeamJoinRequest"("teamId", "userId")
  WHERE "status" = 'PENDING';

ALTER TABLE "Match"
  ADD COLUMN "origin" "MatchOrigin" NOT NULL DEFAULT 'QUEUE';

CREATE INDEX "Match_origin_createdAt_idx" ON "Match"("origin", "createdAt");
