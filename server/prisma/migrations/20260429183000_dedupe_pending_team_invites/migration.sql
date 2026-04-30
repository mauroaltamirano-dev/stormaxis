-- Prevent duplicate pending invites caused by rapid repeated invite submissions.
-- Keep the newest pending invite and expire older duplicates before adding the partial unique index.
WITH ranked_invites AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "teamId", "invitedUserId"
      ORDER BY "createdAt" DESC, "id" DESC
    ) AS duplicate_rank
  FROM "TeamInvite"
  WHERE "status" = 'PENDING'
)
UPDATE "TeamInvite"
SET "status" = 'EXPIRED', "respondedAt" = CURRENT_TIMESTAMP
WHERE "id" IN (
  SELECT "id" FROM ranked_invites WHERE duplicate_rank > 1
);

CREATE UNIQUE INDEX IF NOT EXISTS "TeamInvite_one_pending_per_team_user_key"
  ON "TeamInvite"("teamId", "invitedUserId")
  WHERE "status" = 'PENDING';
