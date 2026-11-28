-- Migration 0001 : rattachement à l'entreprise ou au site des tables qui n'en avaient pas.
-- Sans ce rattachement, ces données seraient partagées entre entreprises clientes.
-- sauvegarde: suppliers, expenses, audit_logs, hse_trainings, problem_reports, sync_queue, driver_devices, trip_logs, driver_maintenance_entries, driver_daily_reports, driver_expenses

-- 1. Colonnes « entreprise »
ALTER TABLE "suppliers" ADD COLUMN IF NOT EXISTS "organization_id" TEXT;
ALTER TABLE "stock_categories" ADD COLUMN IF NOT EXISTS "organization_id" TEXT;
ALTER TABLE "maintenance_types" ADD COLUMN IF NOT EXISTS "organization_id" TEXT;
ALTER TABLE "expenses" ADD COLUMN IF NOT EXISTS "organization_id" TEXT;
ALTER TABLE "audit_logs" ADD COLUMN IF NOT EXISTS "organization_id" TEXT;
ALTER TABLE "hse_trainings" ADD COLUMN IF NOT EXISTS "organization_id" TEXT;
ALTER TABLE "problem_reports" ADD COLUMN IF NOT EXISTS "organization_id" TEXT;
ALTER TABLE "sync_queue" ADD COLUMN IF NOT EXISTS "organization_id" TEXT;

-- 2. Colonnes « site » des données chauffeur
ALTER TABLE "driver_devices" ADD COLUMN IF NOT EXISTS "site_id" TEXT;
ALTER TABLE "trip_logs" ADD COLUMN IF NOT EXISTS "site_id" TEXT;
ALTER TABLE "driver_maintenance_entries" ADD COLUMN IF NOT EXISTS "site_id" TEXT;
ALTER TABLE "driver_daily_reports" ADD COLUMN IF NOT EXISTS "site_id" TEXT;
ALTER TABLE "driver_expenses" ADD COLUMN IF NOT EXISTS "site_id" TEXT;

-- 3. Remplissage à partir des données existantes
UPDATE "driver_devices" t SET "site_id" = d."site_id" FROM "drivers" d WHERE d."id" = t."driver_id" AND t."site_id" IS NULL;
UPDATE "trip_logs" t SET "site_id" = d."site_id" FROM "drivers" d WHERE d."id" = t."driver_id" AND t."site_id" IS NULL;
UPDATE "driver_maintenance_entries" t SET "site_id" = d."site_id" FROM "drivers" d WHERE d."id" = t."driver_id" AND t."site_id" IS NULL;
UPDATE "driver_daily_reports" t SET "site_id" = d."site_id" FROM "drivers" d WHERE d."id" = t."driver_id" AND t."site_id" IS NULL;
UPDATE "driver_expenses" t SET "site_id" = d."site_id" FROM "drivers" d WHERE d."id" = t."driver_id" AND t."site_id" IS NULL;

UPDATE "audit_logs" t SET "organization_id" = u."organization_id" FROM "users" u WHERE u."id" = t."user_id" AND t."organization_id" IS NULL;
UPDATE "problem_reports" t SET "organization_id" = u."organization_id" FROM "users" u WHERE u."id" = t."user_id" AND t."organization_id" IS NULL;
UPDATE "hse_trainings" t SET "organization_id" = u."organization_id" FROM "users" u WHERE u."id" = t."user_id" AND t."organization_id" IS NULL;
UPDATE "hse_trainings" t SET "organization_id" = s."organization_id" FROM "drivers" d JOIN "sites" s ON s."id" = d."site_id" WHERE d."id" = t."driver_id" AND t."organization_id" IS NULL;
UPDATE "expenses" t SET "organization_id" = s."organization_id" FROM "vehicles" v JOIN "sites" s ON s."id" = v."site_id" WHERE v."id" = t."vehicle_id" AND t."organization_id" IS NULL;

-- Lignes restantes : s'il n'existe qu'une seule entreprise (cas actuel), elles lui appartiennent.
-- Les catalogues communs (catégories de stock, types d'entretien) restent partagés (sans entreprise).
DO $$
DECLARE only_org TEXT;
BEGIN
  IF (SELECT COUNT(*) FROM "organizations") = 1 THEN
    SELECT "id" INTO only_org FROM "organizations" LIMIT 1;
    UPDATE "suppliers" SET "organization_id" = only_org WHERE "organization_id" IS NULL;
    UPDATE "expenses" SET "organization_id" = only_org WHERE "organization_id" IS NULL;
    UPDATE "audit_logs" SET "organization_id" = only_org WHERE "organization_id" IS NULL;
    UPDATE "hse_trainings" SET "organization_id" = only_org WHERE "organization_id" IS NULL;
    UPDATE "problem_reports" SET "organization_id" = only_org WHERE "organization_id" IS NULL;
    UPDATE "sync_queue" SET "organization_id" = only_org WHERE "organization_id" IS NULL;
  END IF;
END $$;

-- 4. Index pour les filtres
CREATE INDEX IF NOT EXISTS "suppliers_organization_id_idx" ON "suppliers"("organization_id");
CREATE INDEX IF NOT EXISTS "expenses_organization_id_idx" ON "expenses"("organization_id");
CREATE INDEX IF NOT EXISTS "audit_logs_organization_id_idx" ON "audit_logs"("organization_id", "created_at");
CREATE INDEX IF NOT EXISTS "problem_reports_organization_id_idx" ON "problem_reports"("organization_id");
CREATE INDEX IF NOT EXISTS "driver_expenses_site_id_idx" ON "driver_expenses"("site_id");
CREATE INDEX IF NOT EXISTS "driver_daily_reports_site_id_idx" ON "driver_daily_reports"("site_id");
CREATE INDEX IF NOT EXISTS "trip_logs_site_id_idx" ON "trip_logs"("site_id");
