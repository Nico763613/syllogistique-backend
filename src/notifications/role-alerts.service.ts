import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma.service';

type Sev = 'INFO' | 'WARNING' | 'CRITICAL';
const DAY = 86_400_000;

// Alertes automatiques par département : chaque alerte est adressée au rôle concerné et au site concerné.
// Les alertes CRITIQUES sont copiées à l'Administrateur Général (SUPER_ADMIN).
// Anti-doublon : une même alerte (entité + rôle) n'est émise qu'une fois par 24 h.
@Injectable()
export class RoleAlertsService {
  private readonly logger = new Logger(RoleAlertsService.name);
  constructor(private prisma: PrismaService) {}

  @Cron('30 6 * * *') // 06:30, après le contrôle général de 06:00
  async scheduled() {
    try {
      const n = await this.run();
      this.logger.log(`Alertes par rôle : ${n} générée(s).`);
    } catch (e) {
      this.logger.error(`Alertes par rôle en échec : ${(e as Error).message}`);
    }
  }

  private async emit(created: { n: number }, since: Date, a: { role: string; siteId?: string | null; title: string; message: string; severity: Sev; entity: string; entityId: string }) {
    const targets = a.severity === 'CRITICAL' && a.role !== 'SUPER_ADMIN' ? [a.role, 'SUPER_ADMIN'] : [a.role];
    for (const role of targets) {
      const dup = await this.prisma.notification.findFirst({ where: { entity: a.entity, entityId: a.entityId, roleName: role, createdAt: { gte: since } } });
      if (dup) continue;
      await this.prisma.notification.create({
        data: { title: a.title, message: a.message, severity: a.severity, entity: a.entity, entityId: a.entityId, siteId: a.siteId ?? undefined, roleName: role },
      });
      created.n += 1;
    }
  }

  async run(): Promise<number> {
    const now = new Date();
    const since = new Date(+now - DAY);
    const created = { n: 0 };
    const fr = (d: Date) => d.toLocaleDateString('fr-FR');
    const emit = (a: Parameters<RoleAlertsService['emit']>[2]) => this.emit(created, since, a);

    // --- Logistique & Approvisionnements ---
    const lateOrders = await this.prisma.purchaseOrder.findMany({
      where: { status: { in: ['CONFIRMED', 'PARTIALLY_RECEIVED'] }, expectedDate: { lt: now } },
      include: { supplier: { select: { name: true } } },
    });
    for (const o of lateOrders) {
      const days = Math.floor((+now - +(o.expectedDate as Date)) / DAY);
      await emit({ role: 'ADMIN_LOGISTIQUE', siteId: o.siteId, title: 'Livraison fournisseur en retard', message: `${o.reference} (${o.supplier.name}) attendue le ${fr(o.expectedDate as Date)} : ${days} j de retard.`, severity: days > 7 ? 'CRITICAL' : 'WARNING', entity: 'PurchaseOrder', entityId: o.id });
    }
    const lateTransfers = await this.prisma.stockTransfer.findMany({ where: { status: 'IN_TRANSIT', shippedAt: { lt: new Date(+now - 2 * DAY) } } });
    for (const t of lateTransfers) {
      await emit({ role: 'MAGASINIER', siteId: t.toSiteId, title: 'Transfert en transit depuis plus de 48 h', message: `Le transfert ${t.reference} n'a pas été réceptionné.`, severity: 'WARNING', entity: 'StockTransfer', entityId: t.id });
    }
    const overdueSupplierInvoices = await this.prisma.purchaseInvoice.findMany({ where: { status: { in: ['UNPAID', 'PARTIALLY_PAID'] }, dueDate: { lt: now } }, include: { supplier: { select: { name: true } } } });
    for (const i of overdueSupplierInvoices) {
      await emit({ role: 'ADMIN_LOGISTIQUE', siteId: i.siteId, title: 'Facture fournisseur échue', message: `${i.reference} (${i.supplier.name}) était due le ${fr(i.dueDate as Date)}.`, severity: 'WARNING', entity: 'PurchaseInvoice', entityId: i.id });
    }

    // --- Entrepôt & Stocks : lots périmés / bientôt périmés ---
    const lots = await this.prisma.stockLot.findMany({ where: { quantity: { gt: 0 }, expiryDate: { lt: new Date(+now + 30 * DAY) } }, include: { item: { select: { name: true } } } });
    for (const l of lots) {
      const expired = +(l.expiryDate as Date) < +now;
      await emit({ role: 'MAGASINIER', siteId: l.siteId, title: expired ? 'Lot périmé' : 'Lot bientôt périmé', message: `${l.item.name}, lot ${l.lotNumber} : péremption le ${fr(l.expiryDate as Date)}.`, severity: expired ? 'CRITICAL' : 'WARNING', entity: 'StockLot', entityId: l.id });
    }

    // --- Commercial & Caisse ---
    const overdueInstallments = await this.prisma.salesInstallment.findMany({ where: { dueDate: { lt: now } }, include: { salesInvoice: { select: { id: true, reference: true, siteId: true, status: true } } } });
    for (const i of overdueInstallments) {
      if (Number(i.amountPaid) >= Number(i.amount) || ['CANCELLED', 'PAID'].includes(i.salesInvoice.status)) continue;
      const days = Math.floor((+now - +i.dueDate) / DAY);
      await emit({ role: 'RESPONSABLE_COMMERCIAL', siteId: i.salesInvoice.siteId, title: 'Échéance client impayée', message: `Facture ${i.salesInvoice.reference} : échéance du ${fr(i.dueDate)} non réglée (${days} j).`, severity: days > 30 ? 'CRITICAL' : 'WARNING', entity: 'SalesInstallment', entityId: i.id });
    }
    const staleCash = await this.prisma.cashSession.findMany({ where: { closedAt: null, openedAt: { lt: new Date(+now - DAY) } } });
    for (const s of staleCash) {
      await emit({ role: 'RESPONSABLE_COMMERCIAL', siteId: s.siteId, title: 'Caisse non clôturée depuis plus de 24 h', message: `La session ouverte le ${fr(s.openedAt)} n'a pas été clôturée.`, severity: 'WARNING', entity: 'CashSession', entityId: s.id });
    }

    // --- Charroi & Flotte ---
    const docs = await this.prisma.document.findMany({ where: { expiryDate: { not: null, lt: new Date(+now + 30 * DAY) } }, include: { vehicle: { select: { siteId: true, internalNumber: true } } } });
    for (const d of docs) {
      const expired = +(d.expiryDate as Date) < +now;
      await emit({ role: 'GESTIONNAIRE_FLOTTE', siteId: d.vehicle.siteId, title: expired ? 'Document véhicule expiré' : 'Document véhicule à renouveler', message: `${d.type} du véhicule ${d.vehicle.internalNumber} : échéance le ${fr(d.expiryDate as Date)}.`, severity: expired ? 'CRITICAL' : 'WARNING', entity: 'Document', entityId: d.id });
    }
    const lateTrips = await this.prisma.trip.findMany({ where: { status: 'IN_PROGRESS', startTime: { lt: new Date(+now - DAY) } }, include: { vehicle: { select: { internalNumber: true } } } });
    for (const t of lateTrips) {
      await emit({ role: 'GESTIONNAIRE_FLOTTE', siteId: t.siteId, title: 'Mission en cours depuis plus de 24 h', message: `Véhicule ${t.vehicle.internalNumber} : retour non enregistré.`, severity: 'WARNING', entity: 'Trip', entityId: t.id });
    }

    // --- HSE ---
    const overdueActions = await this.prisma.hseCorrectiveAction.findMany({ where: { status: { not: 'DONE' }, dueDate: { lt: now } } });
    for (const a of overdueActions) {
      const days = Math.floor((+now - +a.dueDate) / DAY);
      await emit({ role: 'GESTIONNAIRE_HSE', siteId: a.siteId, title: 'Action corrective en retard', message: `« ${a.title} » : échéance dépassée de ${days} j.`, severity: days > 14 ? 'CRITICAL' : 'WARNING', entity: 'HseCorrectiveAction', entityId: a.id });
    }
    const trainings = await this.prisma.hseTraining.findMany({ where: { expiresAt: { not: null, lt: new Date(+now + 30 * DAY) } } });
    for (const t of trainings) {
      const expired = +(t.expiresAt as Date) < +now;
      await emit({ role: 'GESTIONNAIRE_HSE', title: expired ? 'Formation / habilitation expirée' : 'Formation / habilitation à renouveler', message: `${t.title} : échéance le ${fr(t.expiresAt as Date)}.`, severity: expired ? 'CRITICAL' : 'WARNING', entity: 'HseTraining', entityId: t.id });
    }
    return created.n;
  }
}
