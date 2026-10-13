-- Rules the Prisma schema language cannot express. Prisma ignores CHECK constraints and
-- triggers when diffing, so they survive future `migrate dev` runs.

-- A refresh token belongs to exactly one principal: a merchant user or a portal customer.
ALTER TABLE "RefreshToken"
  ADD CONSTRAINT "RefreshToken_exactly_one_owner"
  CHECK (num_nonnulls("userId", "customerId") = 1);

-- The points ledger is append-only. Corrections are new entries (ADJUST / REVERSAL), never edits.
-- Deletes are still allowed so that deleting a tenant can cascade.
CREATE FUNCTION "reject_ledger_update"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'PointsLedgerEntry is append-only (attempted % on %)', TG_OP, OLD.id;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "PointsLedgerEntry_append_only"
  BEFORE UPDATE ON "PointsLedgerEntry"
  FOR EACH ROW EXECUTE FUNCTION "reject_ledger_update"();
