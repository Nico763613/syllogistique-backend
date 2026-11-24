import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma.service';

// Historique des affectations chauffeur ↔ véhicule : une ligne ouverte (ended_at nul) par véhicule.
// Toute modification de vehicles.assigned_driver_id passe par ces fonctions : rien n'est jamais effacé.
export async function recordAssignment(
  prisma: PrismaService,
  a: { vehicleId: string; newDriverId: string | null; by?: string | null; reason?: string | null; source: string },
) {
  const now = new Date();
  await prisma.$executeRaw`UPDATE vehicle_assignments SET ended_at = ${now} WHERE vehicle_id = ${a.vehicleId} AND ended_at IS NULL`;
  if (a.newDriverId) {
    await prisma.$executeRaw`INSERT INTO vehicle_assignments (id, vehicle_id, driver_id, started_at, reason, source, by_user_id)
      VALUES (${randomUUID()}, ${a.vehicleId}, ${a.newDriverId}, ${now}, ${a.reason ?? null}, ${a.source}, ${a.by ?? null})`;
  }
}

// Règle : un chauffeur n'a qu'un véhicule actif. Libère ses autres véhicules (historisé) et retourne leurs numéros.
export async function releaseOtherVehicles(prisma: PrismaService, driverId: string, keepVehicleId: string | null, by?: string | null) {
  const others = await prisma.vehicle.findMany({
    where: { assignedDriverId: driverId, deletedAt: null, ...(keepVehicleId ? { id: { not: keepVehicleId } } : {}) },
    select: { id: true, internalNumber: true },
  });
  for (const v of others) {
    await prisma.vehicle.update({ where: { id: v.id }, data: { assignedDriverId: null } });
    await recordAssignment(prisma, { vehicleId: v.id, newDriverId: null, by, reason: 'Chauffeur affecté à un autre véhicule', source: 'AUTO' });
  }
  return others.map((v) => v.internalNumber);
}

export async function assignmentHistory(prisma: PrismaService, vehicleId: string) {
  const rows = await prisma.$queryRaw<any[]>`SELECT a.id, a.driver_id AS "driverId", a.started_at AS "startedAt", a.ended_at AS "endedAt", a.reason, a.source,
      d.first_name AS "firstName", d.last_name AS "lastName"
    FROM vehicle_assignments a LEFT JOIN drivers d ON d.id = a.driver_id
    WHERE a.vehicle_id = ${vehicleId} ORDER BY a.started_at DESC LIMIT 100`;
  return rows.map((r) => ({ ...r, driverName: [r.firstName, r.lastName].filter(Boolean).join(' ') || null }));
}
