-- Migration 0005 : inscriptions de chauffeurs rattachées à leur entreprise.
-- sauvegarde: driver_signups
-- Le lien d'inscription porte le code de l'entreprise (?entreprise=VTX). Les demandes déjà reçues, faites
-- avant ce changement, restent à l'entreprise principale (la plus ancienne), comme auparavant.
-- Seule la nouvelle colonne est remplie ; rien n'est supprimé ni renommé.

ALTER TABLE "driver_signups" ADD COLUMN IF NOT EXISTS "organization_id" TEXT;
CREATE INDEX IF NOT EXISTS "driver_signups_org_idx" ON "driver_signups" ("organization_id", "status");
UPDATE "driver_signups" SET "organization_id" = (SELECT "organization_id" FROM "sites" ORDER BY "created_at" ASC LIMIT 1) WHERE "organization_id" IS NULL;
