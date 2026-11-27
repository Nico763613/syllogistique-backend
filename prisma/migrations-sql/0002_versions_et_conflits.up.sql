-- Migration 0002 : numéro de version par fiche, historique des versions et conflits de synchronisation.
-- Chaque modification d'une fiche augmente son numéro de version et laisse une trace (qui, quand).
-- Une saisie faite hors ligne sur une version dépassée par la modification d'une AUTRE personne
-- n'écrase rien : elle est enregistrée comme conflit, à arbitrer par un responsable.

ALTER TABLE "trips" ADD COLUMN IF NOT EXISTS "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "vehicles" ADD COLUMN IF NOT EXISTS "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "drivers" ADD COLUMN IF NOT EXISTS "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "stock_items" ADD COLUMN IF NOT EXISTS "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "suppliers" ADD COLUMN IF NOT EXISTS "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "driver_daily_reports" ADD COLUMN IF NOT EXISTS "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "driver_expenses" ADD COLUMN IF NOT EXISTS "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "sales_orders" ADD COLUMN IF NOT EXISTS "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "purchase_orders" ADD COLUMN IF NOT EXISTS "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "need_requests" ADD COLUMN IF NOT EXISTS "version" INTEGER NOT NULL DEFAULT 1;

CREATE TABLE IF NOT EXISTS "record_versions" (
  "id" BIGSERIAL PRIMARY KEY,
  "entity" TEXT NOT NULL,
  "entity_id" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "modified_by" TEXT NOT NULL,
  "modified_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "record_versions_entity_idx" ON "record_versions"("entity", "entity_id", "version");

CREATE TABLE IF NOT EXISTS "sync_conflicts" (
  "id" TEXT PRIMARY KEY,
  "organization_id" TEXT NOT NULL,
  "site_id" TEXT,
  "entity" TEXT NOT NULL,
  "entity_id" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "requested_by" TEXT NOT NULL,
  "base_version" INTEGER NOT NULL,
  "server_version" INTEGER NOT NULL,
  "client_payload" JSONB NOT NULL,
  "server_snapshot" JSONB,
  "status" TEXT NOT NULL DEFAULT 'OUVERT',
  "resolved_by" TEXT,
  "resolved_at" TIMESTAMP(3),
  "resolution_note" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "sync_conflicts_scope_idx" ON "sync_conflicts"("organization_id", "site_id", "status");
