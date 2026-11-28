-- Migration 0003 : récupération du mot de passe par code à usage unique.
-- Le code n'est jamais stocké en clair (empreinte SHA-256 salée par la clé du serveur).
-- Un code : 6 chiffres, valable 15 minutes, 5 essais au plus, utilisable une seule fois.
-- Les demandes publiques sont journalisées pour limiter les abus (3 par compte et par heure, 10 par adresse IP).

CREATE TABLE IF NOT EXISTS "password_reset_codes" (
  "id" TEXT PRIMARY KEY,
  "user_id" TEXT NOT NULL,
  "organization_id" TEXT,
  "code_hash" TEXT NOT NULL,
  "channel" TEXT NOT NULL,
  "created_by" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "status" TEXT NOT NULL DEFAULT 'ACTIF',
  "used_at" TIMESTAMP(3)
);
CREATE INDEX IF NOT EXISTS "password_reset_codes_user_idx" ON "password_reset_codes" ("user_id", "status");

CREATE TABLE IF NOT EXISTS "password_reset_requests" (
  "id" TEXT PRIMARY KEY,
  "identifier_hash" TEXT NOT NULL,
  "user_id" TEXT,
  "ip" TEXT,
  "outcome" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "password_reset_requests_ident_idx" ON "password_reset_requests" ("identifier_hash", "created_at");
CREATE INDEX IF NOT EXISTS "password_reset_requests_ip_idx" ON "password_reset_requests" ("ip", "created_at");
