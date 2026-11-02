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
