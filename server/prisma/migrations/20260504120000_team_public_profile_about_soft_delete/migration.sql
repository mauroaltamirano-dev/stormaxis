-- Rich public team profile fields for FACEIT-style team pages.
ALTER TABLE "Team"
  ADD COLUMN IF NOT EXISTS "countryCode" VARCHAR(2),
  ADD COLUMN IF NOT EXISTS "about" VARCHAR(700),
  ADD COLUMN IF NOT EXISTS "isRecruiting" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "recruitingRoles" JSONB,
  ADD COLUMN IF NOT EXISTS "socialLinks" JSONB;

CREATE INDEX IF NOT EXISTS "Team_countryCode_idx" ON "Team"("countryCode");
CREATE INDEX IF NOT EXISTS "Team_isRecruiting_idx" ON "Team"("isRecruiting");
