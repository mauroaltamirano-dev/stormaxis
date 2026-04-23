-- CreateEnum
CREATE TYPE "ReplayUploadStatus" AS ENUM ('UPLOADED', 'PARSED', 'FAILED');

-- CreateTable
CREATE TABLE "MatchReplayUpload" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "uploadedById" TEXT,
    "status" "ReplayUploadStatus" NOT NULL DEFAULT 'UPLOADED',
    "originalName" VARCHAR(260) NOT NULL,
    "storagePath" VARCHAR(500) NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "sha256" VARCHAR(64) NOT NULL,
    "parsedMap" TEXT,
    "parsedGameMode" TEXT,
    "parsedRegion" INTEGER,
    "parsedBuild" INTEGER,
    "parsedDuration" INTEGER,
    "parsedGameDate" TIMESTAMP(3),
    "parsedWinnerTeam" INTEGER,
    "parserStatus" VARCHAR(64),
    "parseError" VARCHAR(500),
    "parsedSummary" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MatchReplayUpload_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MatchReplayUpload_sha256_key" ON "MatchReplayUpload"("sha256");

-- CreateIndex
CREATE INDEX "MatchReplayUpload_matchId_createdAt_idx" ON "MatchReplayUpload"("matchId", "createdAt");

-- CreateIndex
CREATE INDEX "MatchReplayUpload_uploadedById_createdAt_idx" ON "MatchReplayUpload"("uploadedById", "createdAt");

-- CreateIndex
CREATE INDEX "MatchReplayUpload_status_createdAt_idx" ON "MatchReplayUpload"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "MatchReplayUpload" ADD CONSTRAINT "MatchReplayUpload_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchReplayUpload" ADD CONSTRAINT "MatchReplayUpload_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
