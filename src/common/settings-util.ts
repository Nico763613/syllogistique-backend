import { PrismaService } from '../prisma.service';

// Lit des réglages numériques (table settings) avec valeurs par défaut
export async function numericSettings(prisma: PrismaService, defaults: Record<string, number>): Promise<Record<string, number>> {
  const rows = await prisma.setting.findMany({ where: { key: { in: Object.keys(defaults) } } });
  const out = { ...defaults };
  for (const r of rows as Array<{ key: string; value: string }>) {
    const n = Number(r.value);
    if (Number.isFinite(n)) out[r.key] = n;
  }
  return out;
}
