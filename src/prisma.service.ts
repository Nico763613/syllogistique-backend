import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

// Mises à niveau du schéma, idempotentes (sans effet si déjà appliquées). Gardées en phase avec prisma/schema.prisma.
const AUTO_SCHEMA: string[] = [
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
];

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() {
    await this.$connect();
    // Mise à niveau automatique et idempotente : ajoute la colonne « département » si elle manque
    // (aucune migration manuelle à lancer sur Neon). Sans effet si la colonne existe déjà.
    // Les nouvelles tables (inventaire physique, pannes…) sont créées de la même façon.
    for (const sql of AUTO_SCHEMA) {
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
