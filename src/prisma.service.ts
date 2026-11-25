import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { DOC_SEQUENCE_SCHEMA } from './common/doc-numbers';
import { PRICE_REQUEST_SCHEMA } from './purchases/price-requests.schema';
import { PENDING_PAYMENT_SCHEMA } from './payments/pending-payments.schema';

// Mises à niveau du schéma, idempotentes (sans effet si déjà appliquées). Gardées en phase avec prisma/schema.prisma.
const AUTO_SCHEMA: string[] = [
  `ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "kind" TEXT NOT NULL DEFAULT 'CLIENT'`,
  `CREATE TABLE IF NOT EXISTS "vehicle_assignments" ("id" TEXT NOT NULL PRIMARY KEY, "vehicle_id" TEXT NOT NULL, "driver_id" TEXT NOT NULL, "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "ended_at" TIMESTAMP(3), "reason" TEXT, "source" TEXT NOT NULL DEFAULT 'MANUEL', "by_user_id" TEXT)`,
  `CREATE TABLE IF NOT EXISTS "delivery_notes" ("id" TEXT NOT NULL PRIMARY KEY, "number" TEXT NOT NULL UNIQUE, "order_id" TEXT NOT NULL, "delivered_by" TEXT, "delivered_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "receiver_name" TEXT, "place" TEXT, "driver_name" TEXT, "observations" TEXT, "lines" JSONB NOT NULL)`,
  'CREATE INDEX IF NOT EXISTS "delivery_notes_order_idx" ON "delivery_notes"("order_id")',
  'ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "receipt_number" TEXT',
  'CREATE UNIQUE INDEX IF NOT EXISTS "payments_receipt_number_key" ON "payments"("receipt_number") WHERE "receipt_number" IS NOT NULL',
  'CREATE INDEX IF NOT EXISTS "vehicle_assignments_vehicle_idx" ON "vehicle_assignments"("vehicle_id", "started_at")',
  'CREATE INDEX IF NOT EXISTS "vehicle_assignments_driver_idx" ON "vehicle_assignments"("driver_id", "ended_at")',
  `CREATE TABLE IF NOT EXISTS "user_invitations" ("id" TEXT NOT NULL PRIMARY KEY, "user_id" TEXT NOT NULL, "token_hash" TEXT NOT NULL UNIQUE, "expires_at" TIMESTAMP(3) NOT NULL, "used_at" TIMESTAMP(3), "created_by" TEXT, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  'CREATE INDEX IF NOT EXISTS "user_invitations_user_idx" ON "user_invitations"("user_id")',
  `INSERT INTO "vehicle_assignments" ("id","vehicle_id","driver_id","source","reason") SELECT gen_random_uuid()::text, v."id", v."assigned_driver_id", 'INITIAL', 'Affectation existante à la mise en service du suivi' FROM "vehicles" v WHERE v."assigned_driver_id" IS NOT NULL AND v."deleted_at" IS NULL AND NOT EXISTS (SELECT 1 FROM "vehicle_assignments" a WHERE a."vehicle_id" = v."id" AND a."ended_at" IS NULL)`,
  'ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "replaced_at" TIMESTAMP(3)',
  'ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "replaced_by_id" TEXT',
  'ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "note" TEXT',
  'ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "department" TEXT',
  `CREATE TABLE IF NOT EXISTS "inventory_counts" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "site_id" TEXT NOT NULL,
    "location" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "note" TEXT,
    "created_by" TEXT NOT NULL,
    "validated_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validated_at" TIMESTAMP(3)
  )`,
  'CREATE INDEX IF NOT EXISTS "inventory_counts_site_id_created_at_idx" ON "inventory_counts"("site_id", "created_at")',
  `CREATE TABLE IF NOT EXISTS "inventory_count_lines" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "count_id" TEXT NOT NULL REFERENCES "inventory_counts"("id") ON DELETE CASCADE,
    "item_id" TEXT NOT NULL REFERENCES "stock_items"("id"),
    "expected_quantity" DECIMAL(12,2) NOT NULL,
    "counted_quantity" DECIMAL(12,2),
    "note" TEXT
  )`,
  'CREATE UNIQUE INDEX IF NOT EXISTS "inventory_count_lines_count_id_item_id_key" ON "inventory_count_lines"("count_id", "item_id")',
  `ALTER TABLE "vehicles" ADD COLUMN IF NOT EXISTS "registration_type" TEXT NOT NULL DEFAULT 'NORMALE'`,
  'ALTER TABLE "vehicles" ADD COLUMN IF NOT EXISTS "it_expiry_date" TIMESTAMP(3)',
  `CREATE TABLE IF NOT EXISTS "need_requests" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "site_id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "priority" TEXT NOT NULL DEFAULT 'NORMALE',
    "status" TEXT NOT NULL DEFAULT 'BROUILLON',
    "recipient" TEXT,
    "justification" TEXT,
    "decision_note" TEXT,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  'CREATE UNIQUE INDEX IF NOT EXISTS "need_requests_reference_key" ON "need_requests"("reference")',
  'CREATE INDEX IF NOT EXISTS "need_requests_site_id_status_idx" ON "need_requests"("site_id", "status")',
  `CREATE TABLE IF NOT EXISTS "need_request_lines" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "request_id" TEXT NOT NULL REFERENCES "need_requests"("id") ON DELETE CASCADE,
    "item_id" TEXT,
    "vehicle_id" TEXT,
    "designation" TEXT NOT NULL,
    "quantity" DECIMAL(12,2) NOT NULL,
    "unit" TEXT,
    "estimated_unit_price" DECIMAL(14,2),
    "note" TEXT
  )`,
  'CREATE INDEX IF NOT EXISTS "need_request_lines_request_id_idx" ON "need_request_lines"("request_id")',
  `CREATE TABLE IF NOT EXISTS "vehicle_downtimes" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "vehicle_id" TEXT NOT NULL REFERENCES "vehicles"("id"),
    "site_id" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'PANNE',
    "reason" TEXT NOT NULL,
    "estimated_cost" DECIMAL(14,2),
    "actual_cost" DECIMAL(14,2),
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" TIMESTAMP(3),
    "resolution_note" TEXT,
    "created_by" TEXT NOT NULL,
    "resolved_by" TEXT
  )`,
  'CREATE INDEX IF NOT EXISTS "vehicle_downtimes_vehicle_id_idx" ON "vehicle_downtimes"("vehicle_id")',
  'CREATE INDEX IF NOT EXISTS "vehicle_downtimes_site_id_started_at_idx" ON "vehicle_downtimes"("site_id", "started_at")',
  // Circuit panne → réparation → remise en service (colonnes additives, aucune donnée existante modifiée hors étape des pannes déjà closes)
  `ALTER TABLE "vehicle_downtimes" ADD COLUMN IF NOT EXISTS "stage" TEXT NOT NULL DEFAULT 'DECLAREE'`,
  `ALTER TABLE "vehicle_downtimes" ADD COLUMN IF NOT EXISTS "priority" TEXT NOT NULL DEFAULT 'NORMALE'`,
  'ALTER TABLE "vehicle_downtimes" ADD COLUMN IF NOT EXISTS "qualified_at" TIMESTAMP(3)',
  'ALTER TABLE "vehicle_downtimes" ADD COLUMN IF NOT EXISTS "qualified_by" TEXT',
  'ALTER TABLE "vehicle_downtimes" ADD COLUMN IF NOT EXISTS "mechanic_id" TEXT',
  'ALTER TABLE "vehicle_downtimes" ADD COLUMN IF NOT EXISTS "repair_started_at" TIMESTAMP(3)',
  'ALTER TABLE "vehicle_downtimes" ADD COLUMN IF NOT EXISTS "expected_end_at" TIMESTAMP(3)',
  'ALTER TABLE "vehicle_downtimes" ADD COLUMN IF NOT EXISTS "need_request_id" TEXT',
  'ALTER TABLE "vehicle_downtimes" ADD COLUMN IF NOT EXISTS "parts_requested_at" TIMESTAMP(3)',
  `ALTER TABLE "vehicle_downtimes" ADD COLUMN IF NOT EXISTS "stage_log" JSONB NOT NULL DEFAULT '[]'`,
  `UPDATE "vehicle_downtimes" SET "stage" = 'REMISE_EN_SERVICE' WHERE "ended_at" IS NOT NULL AND "stage" = 'DECLAREE'`,
  // Plans d'entretien préventif par véhicule
  `CREATE TABLE IF NOT EXISTS "maintenance_plans" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "vehicle_id" TEXT NOT NULL REFERENCES "vehicles"("id"),
    "maintenance_type_id" TEXT NOT NULL REFERENCES "maintenance_types"("id"),
    "interval_km" INTEGER,
    "interval_days" INTEGER,
    "alert_km" INTEGER NOT NULL DEFAULT 500,
    "alert_days" INTEGER NOT NULL DEFAULT 15,
    "last_done_km" INTEGER,
    "last_done_at" TIMESTAMP(3),
    "planned_maintenance_id" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  'CREATE UNIQUE INDEX IF NOT EXISTS "maintenance_plans_vehicle_id_maintenance_type_id_key" ON "maintenance_plans"("vehicle_id", "maintenance_type_id")',
  'CREATE INDEX IF NOT EXISTS "maintenance_plans_vehicle_id_idx" ON "maintenance_plans"("vehicle_id")',
];

// Tableaux de bord par département : instructions lues dans prisma/dashboards-upgrade.sql (blocs séparés par « --# »).
// Le dossier prisma/ est copié dans l'image Docker ; en cas d'absence du fichier, rien n'est fait.
function loadDashboardUpgrades(): string[] {
  try {
    const file = join(__dirname, '..', 'prisma', 'dashboards-upgrade.sql');
    if (!existsSync(file)) return [];
    return readFileSync(file, 'utf-8')
      .split(/^--#\s*$/m)
      .map((block) => block.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n').trim().replace(/;$/, ''))
      .filter(Boolean);
  } catch (e: any) {
    console.warn('⚠️  Lecture de dashboards-upgrade.sql impossible :', e?.message ?? e);
    return [];
  }
}

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() {
    await this.$connect();
    // Mise à niveau automatique et idempotente : ajoute la colonne « département » si elle manque
    // (aucune migration manuelle à lancer sur Neon). Sans effet si la colonne existe déjà.
    // Les nouvelles tables (inventaire physique, pannes…) sont créées de la même façon.
    for (const sql of [...AUTO_SCHEMA, ...DOC_SEQUENCE_SCHEMA, ...PRICE_REQUEST_SCHEMA, ...PENDING_PAYMENT_SCHEMA, ...loadDashboardUpgrades()]) {
      try {
        await this.$executeRawUnsafe(sql);
      } catch (e: any) {
        console.warn('⚠️  Mise à niveau automatique du schéma impossible :', e?.message ?? e);
      }
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
