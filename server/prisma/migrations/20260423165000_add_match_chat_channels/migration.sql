ALTER TABLE "ChatMessage"
  ADD COLUMN "channel" VARCHAR(16) NOT NULL DEFAULT 'GLOBAL',
  ADD COLUMN "team" INTEGER;

CREATE INDEX "ChatMessage_matchId_channel_createdAt_idx" ON "ChatMessage"("matchId", "channel", "createdAt");
