-- Trigram matching for substring search on the customer list. Ships with PostgreSQL (contrib).
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- CreateIndex
CREATE INDEX "Customer_tenantId_name_id_idx" ON "Customer"("tenantId", "name", "id");

-- CreateIndex
CREATE INDEX "Customer_tenantId_pointsBalance_id_idx" ON "Customer"("tenantId", "pointsBalance" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "Customer_name_idx" ON "Customer" USING GIN ("name" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "Customer_email_idx" ON "Customer" USING GIN ("email" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "Customer_phone_idx" ON "Customer" USING GIN ("phone" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "Customer_tags_idx" ON "Customer" USING GIN ("tags");
