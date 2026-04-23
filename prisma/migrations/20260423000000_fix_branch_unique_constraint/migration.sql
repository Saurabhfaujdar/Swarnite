-- DropIndex (branches.code global unique → compound unique with companyId)
DROP INDEX IF EXISTS "branches_code_key";

-- CreateIndex (compound unique: same branch code allowed across different companies)
CREATE UNIQUE INDEX "branches_companyId_code_key" ON "branches"("companyId", "code");
