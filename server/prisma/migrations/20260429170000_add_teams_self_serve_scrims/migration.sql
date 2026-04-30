-- Teams and self-serve instant scrims.
CREATE TYPE "TeamRole" AS ENUM ('OWNER', 'CAPTAIN', 'MEMBER');
CREATE TYPE "TeamStatus" AS ENUM ('ACTIVE', 'ARCHIVED');
CREATE TYPE "TeamMemberStatus" AS ENUM ('ACTIVE', 'INVITED', 'LEFT', 'KICKED');
CREATE TYPE "TeamInviteStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'EXPIRED');
CREATE TYPE "ScrimSearchStatus" AS ENUM ('OPEN', 'CHALLENGED', 'MATCHED', 'CANCELLED', 'EXPIRED');
CREATE TYPE "ScrimChallengeStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'CANCELLED', 'EXPIRED');
CREATE TYPE "ScrimAccessRole" AS ENUM ('COACH', 'OBSERVER');

CREATE TABLE "Team" (
  "id" TEXT NOT NULL,
  "name" VARCHAR(80) NOT NULL,
  "slug" VARCHAR(90) NOT NULL,
  "logoUrl" VARCHAR(500),
  "status" "TeamStatus" NOT NULL DEFAULT 'ACTIVE',
  "ownerId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Team_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TeamMember" (
  "id" TEXT NOT NULL,
  "teamId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "role" "TeamRole" NOT NULL DEFAULT 'MEMBER',
  "status" "TeamMemberStatus" NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TeamMember_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TeamInvite" (
  "id" TEXT NOT NULL,
  "teamId" TEXT NOT NULL,
  "invitedUserId" TEXT NOT NULL,
  "invitedById" TEXT NOT NULL,
  "status" "TeamInviteStatus" NOT NULL DEFAULT 'PENDING',
  "respondedAt" TIMESTAMP(3),
  "expiresAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TeamInvite_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ScrimSearch" (
  "id" TEXT NOT NULL,
  "teamId" TEXT NOT NULL,
  "createdById" TEXT NOT NULL,
  "status" "ScrimSearchStatus" NOT NULL DEFAULT 'OPEN',
  "starterUserIds" JSONB NOT NULL,
  "coachUserId" TEXT,
  "observerUserIds" JSONB,
  "notes" VARCHAR(500),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "expiresAt" TIMESTAMP(3),
  CONSTRAINT "ScrimSearch_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ScrimChallenge" (
  "id" TEXT NOT NULL,
  "fromSearchId" TEXT NOT NULL,
  "toSearchId" TEXT NOT NULL,
  "fromTeamId" TEXT NOT NULL,
  "toTeamId" TEXT NOT NULL,
  "status" "ScrimChallengeStatus" NOT NULL DEFAULT 'PENDING',
  "matchId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "respondedAt" TIMESTAMP(3),
  CONSTRAINT "ScrimChallenge_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ScrimAccess" (
  "id" TEXT NOT NULL,
  "matchId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "team" INTEGER NOT NULL,
  "role" "ScrimAccessRole" NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ScrimAccess_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "ScrimDetails" ADD COLUMN "team1Id" TEXT;
ALTER TABLE "ScrimDetails" ADD COLUMN "team2Id" TEXT;
ALTER TABLE "ScrimDetails" ADD COLUMN "challengeId" TEXT;

CREATE UNIQUE INDEX "Team_slug_key" ON "Team"("slug");
CREATE INDEX "Team_ownerId_idx" ON "Team"("ownerId");
CREATE INDEX "Team_status_createdAt_idx" ON "Team"("status", "createdAt");
CREATE UNIQUE INDEX "TeamMember_teamId_userId_key" ON "TeamMember"("teamId", "userId");
CREATE INDEX "TeamMember_userId_status_idx" ON "TeamMember"("userId", "status");
CREATE INDEX "TeamMember_teamId_status_idx" ON "TeamMember"("teamId", "status");
CREATE INDEX "TeamInvite_teamId_status_idx" ON "TeamInvite"("teamId", "status");
CREATE INDEX "TeamInvite_invitedUserId_status_idx" ON "TeamInvite"("invitedUserId", "status");
CREATE INDEX "ScrimSearch_teamId_status_idx" ON "ScrimSearch"("teamId", "status");
CREATE INDEX "ScrimSearch_status_createdAt_idx" ON "ScrimSearch"("status", "createdAt");
CREATE UNIQUE INDEX "ScrimChallenge_fromSearchId_toSearchId_key" ON "ScrimChallenge"("fromSearchId", "toSearchId");
CREATE INDEX "ScrimChallenge_toTeamId_status_idx" ON "ScrimChallenge"("toTeamId", "status");
CREATE INDEX "ScrimChallenge_fromTeamId_status_idx" ON "ScrimChallenge"("fromTeamId", "status");
CREATE UNIQUE INDEX "ScrimAccess_matchId_userId_key" ON "ScrimAccess"("matchId", "userId");
CREATE INDEX "ScrimAccess_matchId_team_idx" ON "ScrimAccess"("matchId", "team");
CREATE INDEX "ScrimAccess_userId_idx" ON "ScrimAccess"("userId");

ALTER TABLE "Team" ADD CONSTRAINT "Team_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TeamMember" ADD CONSTRAINT "TeamMember_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TeamMember" ADD CONSTRAINT "TeamMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TeamInvite" ADD CONSTRAINT "TeamInvite_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TeamInvite" ADD CONSTRAINT "TeamInvite_invitedUserId_fkey" FOREIGN KEY ("invitedUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TeamInvite" ADD CONSTRAINT "TeamInvite_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ScrimSearch" ADD CONSTRAINT "ScrimSearch_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ScrimSearch" ADD CONSTRAINT "ScrimSearch_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ScrimChallenge" ADD CONSTRAINT "ScrimChallenge_fromSearchId_fkey" FOREIGN KEY ("fromSearchId") REFERENCES "ScrimSearch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ScrimChallenge" ADD CONSTRAINT "ScrimChallenge_toSearchId_fkey" FOREIGN KEY ("toSearchId") REFERENCES "ScrimSearch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ScrimChallenge" ADD CONSTRAINT "ScrimChallenge_fromTeamId_fkey" FOREIGN KEY ("fromTeamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ScrimChallenge" ADD CONSTRAINT "ScrimChallenge_toTeamId_fkey" FOREIGN KEY ("toTeamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ScrimAccess" ADD CONSTRAINT "ScrimAccess_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ScrimAccess" ADD CONSTRAINT "ScrimAccess_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
