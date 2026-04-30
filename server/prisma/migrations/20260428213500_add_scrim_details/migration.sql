-- Add lightweight metadata for closed-beta admin/manual scrims.
CREATE TABLE IF NOT EXISTS "ScrimDetails" (
  "id" TEXT NOT NULL,
  "matchId" TEXT NOT NULL,
  "team1Name" VARCHAR(80) NOT NULL,
  "team2Name" VARCHAR(80) NOT NULL,
  "notes" VARCHAR(500),
  "scheduledAt" TIMESTAMP(3),
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ScrimDetails_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ScrimDetails_matchId_key" ON "ScrimDetails"("matchId");
CREATE INDEX IF NOT EXISTS "ScrimDetails_createdAt_idx" ON "ScrimDetails"("createdAt");
CREATE INDEX IF NOT EXISTS "ScrimDetails_scheduledAt_idx" ON "ScrimDetails"("scheduledAt");
CREATE INDEX IF NOT EXISTS "ScrimDetails_createdById_idx" ON "ScrimDetails"("createdById");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ScrimDetails_matchId_fkey'
  ) THEN
    ALTER TABLE "ScrimDetails"
      ADD CONSTRAINT "ScrimDetails_matchId_fkey"
      FOREIGN KEY ("matchId") REFERENCES "Match"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
