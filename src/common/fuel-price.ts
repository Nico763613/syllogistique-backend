import { PrismaService } from '../prisma.service';

// Tarif carburant unique (prix à la pompe), modifiable par l'Administrateur.
// Lu à chaque opération (aucun cache) : un changement de tarif s'applique immédiatement
// à tous les calculs suivants. L'historique garde le prix appliqué à sa date.
export const FUEL_PRICE_KEY = 'FUEL_PRICE_PER_LITER';
export const DEFAULT_FUEL_PRICE = 12000;

export async function currentFuelPrice(prisma: PrismaService, organizationId: string): Promise<number> {
  const setting = await prisma.setting.findUnique({
    where: { organizationId_key: { organizationId, key: FUEL_PRICE_KEY } },
  });
  const n = Number(setting?.value);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_FUEL_PRICE;
}
