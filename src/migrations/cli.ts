import { PrismaClient } from '@prisma/client';
import { migrationStatus, rollbackMigration, runMigrations } from './migration-runner';

// Commandes de migration (à lancer avec la variable DATABASE_URL de la base visée) :
//   node dist/migrations/cli.js status        → état de chaque migration
//   node dist/migrations/cli.js up            → applique les migrations en attente
//   node dist/migrations/cli.js down <numéro> → annule la dernière migration (si un .down.sql existe)
// Avant « up » ou « down » en production : créer une branche de sauvegarde Neon (voir docs/MIGRATIONS.md).
async function main() {
  const [cmd, arg] = process.argv.slice(2);
  const prisma = new PrismaClient();
  try {
    if (cmd === 'status') console.table(await migrationStatus(prisma));
    else if (cmd === 'up') console.log('Appliquées :', (await runMigrations(prisma, 'cli')).join(', ') || 'aucune');
    else if (cmd === 'down' && /^\d+$/.test(arg || '')) { await rollbackMigration(prisma, Number(arg)); console.log(`Migration ${arg} annulée.`); }
    else { console.log('Usage : status | up | down <numéro>'); process.exitCode = 2; }
  } catch (e: any) {
    console.error('Échec :', e?.message ?? e);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}
main();
