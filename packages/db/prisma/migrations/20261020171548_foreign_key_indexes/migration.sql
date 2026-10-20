-- DropIndex
DROP INDEX "PointsLedgerEntry_tenantId_customerId_createdAt_idx";

-- DropIndex
DROP INDEX "Purchase_tenantId_customerId_createdAt_idx";

-- CreateIndex
CREATE INDEX "PointsLedgerEntry_customerId_createdAt_idx" ON "PointsLedgerEntry"("customerId", "createdAt");

-- CreateIndex
CREATE INDEX "PointsLedgerEntry_purchaseId_idx" ON "PointsLedgerEntry"("purchaseId");

-- CreateIndex
CREATE INDEX "PointsLedgerEntry_redemptionId_idx" ON "PointsLedgerEntry"("redemptionId");

-- CreateIndex
CREATE INDEX "Purchase_customerId_createdAt_idx" ON "Purchase"("customerId", "createdAt");
