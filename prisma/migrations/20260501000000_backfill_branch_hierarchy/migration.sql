-- Idempotent re-backfill of branches.isMaster / branchType / parentId.
--
-- Why this exists:
--   The earlier 20260423000000_fix_branch_unique_constraint migration carried
--   the same UPDATE statements, but some deployed instances were observed
--   with branches still presenting isMaster=false / parentId=null
--   (the Store Hierarchy panel rendered empty). To self-heal regardless of
--   how that earlier migration was applied, we re-run the data-fix here in
--   a strictly idempotent form (UPDATEs are no-ops once data is correct).

-- 1. Promote the lowest-id, non-deleted branch per company to MASTER.
UPDATE "branches" b
SET
    "isMaster" = true,
    "branchType" = 'MASTER'
FROM (
    SELECT DISTINCT ON ("companyId") "id"
    FROM "branches"
    WHERE "isDeleted" = false
    ORDER BY "companyId", "id" ASC
) first_branch
WHERE b."id" = first_branch."id"
  AND (b."isMaster" = false OR b."branchType" <> 'MASTER');

-- 2. Point any orphan child branches at their company's master.
UPDATE "branches" child
SET "parentId" = master."id"
FROM "branches" master
WHERE child."companyId" = master."companyId"
  AND master."isMaster" = true
  AND child."isMaster" = false
  AND child."parentId" IS NULL
  AND child."isDeleted" = false;
