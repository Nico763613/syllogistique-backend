import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

type Actor = { userId: string; role: string; siteId?: string };
const num = (v: any) => Number(v || 0);

// Tableau de bord commercial : tous les chiffres sont calculés depuis les factures, commandes et encaissements enregistrés.
@Injectable()
export class SalesDashboardService {
  constructor(private prisma: PrismaService) {}

  async summary(q: { from?: string; to?: string; siteId?: string; agentId?: string; customerId?: string; productId?: string }, actor: Actor) {
    const now = new Date();
    const from = q.from ? new Date(q.from) : new Date(now.getFullYear(), now.getMonth(), 1);
    const to = q.to ? new Date(new Date(q.to).getTime() + 864e5 - 1) : now;
    const today0 = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    // Un utilisateur rattaché à un site ne voit que son site ; la direction peut choisir
    const siteId = actor.role !== 'SUPER_ADMIN' && actor.siteId ? actor.siteId : q.siteId || undefined;
    const invWhere: any = { status: { notIn: ['CANCELLED', 'DRAFT'] }, ...(siteId ? { siteId } : {}), ...(q.agentId ? { createdById: q.agentId } : {}), ...(q.customerId ? { customerId: q.customerId } : {}) };
    const inPeriod = { ...invWhere, invoiceDate: { gte: from, lte: to } };

    const [invoices, today, openInv, orderGroups, payments, lines] = await Promise.all([
      this.prisma.salesInvoice.findMany({ where: inPeriod, select: { totalAmount: true, customerId: true, createdById: true } }),
      this.prisma.salesInvoice.aggregate({ _sum: { totalAmount: true }, _count: true, where: { ...invWhere, invoiceDate: { gte: today0 } } }),
      this.prisma.salesInvoice.findMany({ where: { ...invWhere, status: { in: ['UNPAID', 'PARTIALLY_PAID'] } }, select: { totalAmount: true, amountPaid: true, dueDate: true } }),
      this.prisma.salesOrder.groupBy({ by: ['status'], _count: true, where: { ...(siteId ? { siteId } : {}), ...(q.customerId ? { customerId: q.customerId } : {}), ...(q.agentId ? { createdById: q.agentId } : {}), orderDate: { gte: from, lte: to } } }),
      this.prisma.payment.aggregate({ _sum: { amount: true }, _count: true, where: { direction: 'IN', salesInvoiceId: { not: null }, paymentDate: { gte: from, lte: to }, ...(siteId ? { siteId } : {}), ...(q.agentId ? { createdById: q.agentId } : {}) } }),
      this.prisma.salesOrderLine.findMany({ where: { salesOrder: { status: { notIn: ['QUOTE', 'CANCELLED'] }, ...(siteId ? { siteId } : {}), ...(q.customerId ? { customerId: q.customerId } : {}), orderDate: { gte: from, lte: to } }, ...(q.productId ? { itemId: q.productId } : {}) }, select: { itemId: true, quantityOrdered: true, lineTotal: true, item: { select: { name: true } } } }),
    ]);

    const byStatus: Record<string, number> = Object.fromEntries(orderGroups.map((g) => [g.status, g._count]));
    const turnover = invoices.reduce((a, i) => a + num(i.totalAmount), 0);
    const overdue = openInv.filter((i) => i.dueDate && i.dueDate < now);

    const prod = new Map<string, { name: string; qty: number; amount: number }>();
    for (const l of lines) { const p = prod.get(l.itemId) ?? { name: l.item.name, qty: 0, amount: 0 }; p.qty += num(l.quantityOrdered); p.amount += num(l.lineTotal); prod.set(l.itemId, p); }

    const agent = new Map<string, { total: number; count: number }>();
    for (const i of invoices) { const a = agent.get(i.createdById) ?? { total: 0, count: 0 }; a.total += num(i.totalAmount); a.count += 1; agent.set(i.createdById, a); }
    const users = await this.prisma.user.findMany({ where: { id: { in: [...agent.keys()] } }, select: { id: true, firstName: true, lastName: true } });
    const uname = new Map(users.map((u) => [u.id, `${u.firstName} ${u.lastName}`]));

    return {
      period: { from, to }, siteId: siteId ?? null,
      turnover: Math.round(turnover), invoicesCount: invoices.length,
      salesToday: Math.round(num(today._sum.totalAmount)), salesTodayCount: today._count,
      ordersCount: Object.entries(byStatus).filter(([s]) => s !== 'QUOTE' && s !== 'CANCELLED').reduce((a, [, n]) => a + n, 0),
      quotesPending: byStatus.QUOTE ?? 0,
      ordersToPrepare: byStatus.CONFIRMED ?? 0,
      ordersPartiallyDelivered: byStatus.PARTIALLY_DELIVERED ?? 0,
      ordersDelivered: byStatus.DELIVERED ?? 0,
      paymentsReceived: Math.round(num(payments._sum.amount)), paymentsCount: payments._count,
      unpaid: { count: openInv.length, amount: Math.round(openInv.reduce((a, i) => a + num(i.totalAmount) - num(i.amountPaid), 0)), overdueCount: overdue.length },
      activeCustomers: new Set(invoices.map((i) => i.customerId)).size,
      topProducts: [...prod.entries()].map(([id, p]) => ({ id, ...p, amount: Math.round(p.amount) })).sort((a, b) => b.amount - a.amount).slice(0, 5),
      agents: [...agent.entries()].map(([id, a]) => ({ id, name: uname.get(id) ?? '—', total: Math.round(a.total), count: a.count })).sort((a, b) => b.total - a.total),
    };
  }
}
