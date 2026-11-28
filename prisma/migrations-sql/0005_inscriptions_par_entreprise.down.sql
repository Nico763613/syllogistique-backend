-- Retour arrière de la migration 0005 (les demandes redeviennent communes à l'entreprise principale).
DROP INDEX IF EXISTS "driver_signups_org_idx";
ALTER TABLE "driver_signups" DROP COLUMN IF EXISTS "organization_id";
