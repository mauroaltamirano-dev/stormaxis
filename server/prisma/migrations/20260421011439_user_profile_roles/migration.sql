-- CreateEnum
CREATE TYPE "PlayerRole" AS ENUM ('TANK', 'DPS', 'BRUISER', 'SUPPORT', 'HEALER');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "mainRole" "PlayerRole",
ADD COLUMN     "secondaryRole" "PlayerRole";

-- CreateIndex
CREATE INDEX "User_mainRole_idx" ON "User"("mainRole");

-- CreateIndex
CREATE INDEX "User_secondaryRole_idx" ON "User"("secondaryRole");
