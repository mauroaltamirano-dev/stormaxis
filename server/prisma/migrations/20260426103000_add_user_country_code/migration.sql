ALTER TABLE "User" ADD COLUMN "countryCode" VARCHAR(2);

CREATE INDEX "User_countryCode_idx" ON "User"("countryCode");
