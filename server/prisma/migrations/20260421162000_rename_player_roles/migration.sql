-- Align HOTS MVP roles with product taxonomy:
-- Ranged, Healer, Offlane, Flex, Tank.
ALTER TYPE "PlayerRole" RENAME VALUE 'DPS' TO 'RANGED';
ALTER TYPE "PlayerRole" RENAME VALUE 'BRUISER' TO 'OFFLANE';
ALTER TYPE "PlayerRole" RENAME VALUE 'SUPPORT' TO 'FLEX';
