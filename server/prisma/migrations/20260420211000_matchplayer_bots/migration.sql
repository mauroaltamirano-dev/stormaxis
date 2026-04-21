-- AlterTable
ALTER TABLE "MatchPlayer"
  ADD COLUMN "isBot" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "botName" TEXT,
  ALTER COLUMN "userId" DROP NOT NULL;

-- Index
CREATE INDEX "MatchPlayer_isBot_idx" ON "MatchPlayer"("isBot");
