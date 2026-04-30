-- Mark admin-created test users that can fill self-serve scrim rosters.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "isBot" BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS "User_isBot_idx" ON "User"("isBot");
