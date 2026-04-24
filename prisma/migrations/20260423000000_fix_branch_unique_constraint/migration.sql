-- DropIndex (branches.code global unique → compound unique with companyId)
DROP INDEX IF EXISTS "branches_code_key";

-- CreateIndex (compound unique: same branch code allowed across different companies)
CREATE UNIQUE INDEX "branches_companyId_code_key" ON "branches"("companyId", "code");

-- Fix existing data: mark the first branch per company as MASTER
-- This fixes the Store Hierarchy not rendering for deployed instances
-- where the seed created branches without isMaster=true / branchType='MASTER'.
UPDATE "branches" b
SET "isMaster" = true, "branchType" = 'MASTER'
FROM (
  SELECT DISTINCT ON ("companyId") "id"
  FROM "branches"
  WHERE "isDeleted" = false
  ORDER BY "companyId", "id" ASC
) first_branch
WHERE b."id" = first_branch."id"
  AND (b."isMaster" = false OR b."branchType" != 'MASTER');

-- Set parentId on child branches that have no parent yet
-- (point them to the master branch of their company)
UPDATE "branches" child
SET "parentId" = master."id"
FROM "branches" master
WHERE child."companyId" = master."companyId"
  AND master."isMaster" = true
  AND child."isMaster" = false
  AND child."parentId" IS NULL
  AND child."isDeleted" = false;
