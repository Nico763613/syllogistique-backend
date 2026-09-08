import { PrismaClient, RoleName } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  // 1. Rôles
  const roleNames = Object.values(RoleName);
  for (const name of roleNames) {
    await prisma.role.upsert({
      where: { name },
      update: {},
      create: { name, description: name.replace(/_/g, ' ') },
    });
  }

  // 2. Organisation + Site par défaut
  const org = await prisma.organization.upsert({
    where: { id: '00000000-0000-0000-0000-000000000001' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000001',
      name: 'SYLLOGISTIQUE',
      currency: 'GNF',
    },
  });

  const site = await prisma.site.upsert({
    where: { id: '00000000-0000-0000-0000-000000000002' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000002',
      organizationId: org.id,
      name: 'Site Minier Principal',
      status: 'ACTIVE',
    },
  });

  // 3. Utilisateur Super Admin par défaut
  const adminRole = await prisma.role.findUnique({ where: { name: 'SUPER_ADMIN' } });
  const passwordHash = await bcrypt.hash('ChangeMoi123!', 10);
  await prisma.user.upsert({
    where: { email: 'admin@syllogistique.local' },
    update: {},
    create: {
      organizationId: org.id,
      siteId: site.id,
      roleId: adminRole!.id,
      firstName: 'Super',
      lastName: 'Admin',
      email: 'admin@syllogistique.local',
      passwordHash,
      status: 'ACTIVE',
    },
  });

  // 4. Types de maintenance
  const maintenanceTypes = [
    ['VIDANGE', 'Vidange'],
    ['REVISION', 'Révision'],
    ['PNEUS', 'Pneus'],
    ['FREINS', 'Freins'],
    ['BATTERIE', 'Batterie'],
    ['HUILE', 'Huile'],
    ['FILTRE', 'Filtre'],
    ['SUSPENSION', 'Suspension'],
    ['REPARATION', 'Réparation'],
    ['AUTRE', 'Autre'],
  ];
  for (const [code, label] of maintenanceTypes) {
    await prisma.maintenanceType.upsert({
      where: { code },
      update: {},
      create: { code, label },
    });
  }

  // 5. Catégories de stock
  const categories = [
    'Pièces détachées', 'Pneus', 'Huiles', 'Lubrifiants',
    'Fournitures', 'Équipements', 'Outillage', 'Consommables', 'Autres',
  ];
  for (const name of categories) {
    await prisma.stockCategory.upsert({
      where: { name },
      update: {},
      create: { name },
    });
  }

  // 6. Paramètres tarifs carburant par défaut
  await prisma.setting.upsert({
    where: { organizationId_key: { organizationId: org.id, key: 'TRUCK_FUEL_PRICE' } },
    update: {},
    create: { organizationId: org.id, key: 'TRUCK_FUEL_PRICE', value: '10000' },
  });
  await prisma.setting.upsert({
    where: { organizationId_key: { organizationId: org.id, key: 'SERVICE_VEHICLE_FUEL_PRICE' } },
    update: {},
    create: { organizationId: org.id, key: 'SERVICE_VEHICLE_FUEL_PRICE', value: '12000' },
  });

  console.log('✅ Seed terminé. Connexion admin : admin@syllogistique.local / ChangeMoi123!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
