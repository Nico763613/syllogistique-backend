import { PrismaService } from '../prisma.service';
import { toNumber } from '../common/actor';

// Totaux d'une session de caisse. Espèces attendues = fond de caisse + encaissements espèces
// − remboursements espèces − décaissements.
export async function sessionTotals(prisma: PrismaService, sessionId: string, openingFloat: number) {
  const [cashIn, cashRefunds, expenses, byMethod] = await Promise.all([
    prisma.payment.aggregate({ where: { cashSessionId: sessionId, direction: 'IN', method: 'CASH' }, _sum: { amount: true } }),
    prisma.payment.aggregate({ where: { cashSessionId: sessionId, direction: 'OUT', method: 'CASH' }, _sum: { amount: true } }),
    prisma.cashExpense.aggregate({ where: { cashSessionId: sessionId }, _sum: { amount: true } }),
    prisma.payment.groupBy({ by: ['method'], where: { cashSessionId: sessionId, direction: 'IN' }, _sum: { amount: true } }),
  ]);
  const cashCollected = Math.round(toNumber(cashIn._sum.amount));
  const refunds = Math.round(toNumber(cashRefunds._sum.amount));
  const spent = Math.round(toNumber(expenses._sum.amount));
  const expectedCash = Math.round(openingFloat) + cashCollected - refunds - spent;
  const collectedByMethod: Record<string, number> = {};
  for (const m of byMethod as Array<{ method: string; _sum: { amount: unknown } }>) {
    collectedByMethod[m.method] = Math.round(toNumber(m._sum.amount));
  }
  return { cashCollected, cashRefunds: refunds, expenses: spent, expectedCash, collectedByMethod };
}
