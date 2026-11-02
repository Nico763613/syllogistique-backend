import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() {
    await this.$connect();
    // Mise à niveau automatique et idempotente : ajoute la colonne « département » si elle manque
    // (aucune migration manuelle à lancer sur Neon). Sans effet si la colonne existe déjà.
    try {
      await this.$executeRawUnsafe('ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "department" TEXT');
    } catch (e: any) {
      console.warn('⚠️  Mise à niveau de la colonne « department » impossible :', e?.message ?? e);
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
