-- Add MVP voting support
ALTER TABLE "Match" ADD COLUMN IF NOT EXISTS "mvpUserId" TEXT;

CREATE TABLE IF NOT EXISTS "MvpVote" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "nomineeUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MvpVote_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "Match_mvpUserId_idx" ON "Match"("mvpUserId");
CREATE INDEX IF NOT EXISTS "MvpVote_matchId_idx" ON "MvpVote"("matchId");
CREATE INDEX IF NOT EXISTS "MvpVote_nomineeUserId_idx" ON "MvpVote"("nomineeUserId");
CREATE UNIQUE INDEX IF NOT EXISTS "MvpVote_matchId_userId_key" ON "MvpVote"("matchId", "userId");

DO $$
BEGIN
    ALTER TABLE "Match" ADD CONSTRAINT "Match_mvpUserId_fkey"
      FOREIGN KEY ("mvpUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    ALTER TABLE "MvpVote" ADD CONSTRAINT "MvpVote_matchId_fkey"
      FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    ALTER TABLE "MvpVote" ADD CONSTRAINT "MvpVote_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    ALTER TABLE "MvpVote" ADD CONSTRAINT "MvpVote_nomineeUserId_fkey"
      FOREIGN KEY ("nomineeUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;
