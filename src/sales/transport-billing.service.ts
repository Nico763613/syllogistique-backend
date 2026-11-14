import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { AuditService } from '../audit/audit.service';
import { Actor } from '../common/actor';
import { TransportInvoiceDto } from './dto/transport.dto';

// Facturation des transports : trajets des camions validés par le Responsable des opérations, facturés au prix par tonne
@Injectable()
export class TransportBillingService {
  constructor(private prisma: PrismaService, private audit: AuditService) {}

  private async tonPrice(): Promise<number> {
    try {
      const s = await this.prisma.setting.findFirst({ where: { key: 'TON_PRICE' } });
      const v = Number(s?.value);
      return Number.isFinite(v) && v > 0 ? v : 0;
    } catch { return 0; }
  }

  private day(d: Date) { return d.toISOString().slice(0, 10); }

  // Ensemble des couples chauffeur+jour dont la fiche est validée par les opérations
  private async validatedKeys(trips: { driverId: string; tripDate: Date }[]) {
    if (!trips.length) return new Set<string>();
    const reports = await this.prisma.driverDailyReport.findMany({
      where: { driverId: { in: [...new Set(trips.map((t) => t.driverId))] }, reportDate: { in: [...new Set(trips.map((t) => +t.tripDate))].map((x) => new Date(x)) }, opsAt: { not: null }, rejectedAt: null },
      select: { driverId: true, reportDate: true },
    });
    return new Set(reports.map((r) => r.driverId + '|' + this.day(r.reportDate)));
  }

  async unbilled(actor: Actor, params: { siteId?: string; from?: string; to?: string }) {
    const siteId = actor.role === 'SUPER_ADMIN' ? params.siteId : actor.siteId ?? params.siteId;
    const trips = await this.prisma.trip.findMany({
      where: {
        ...(siteId ? { siteId } : {}),
        billedInvoiceId: null, status: { not: 'CANCELLED' }, tripsCount: { gt: 0 }, vehicle: { vehicleType: 'TRUCK' },
        ...(params.from || params.to ? { tripDate: { ...(params.from ? { gte: new Date(params.from) } : {}), ...(params.to ? { lte: new Date(params.to) } : {}) } } : {}),
      },
      include: { vehicle: { select: { internalNumber: true, registrationNumber: true } }, driver: { select: { firstName: true, lastName: true } } },
      orderBy: { tripDate: 'asc' },
      take: 500,
    });
    const ok = await this.validatedKeys(trips);
    const valid = trips.filter((t) => ok.has(t.driverId + '|' + this.day(t.tripDate)));
    return {
      pricePerTon: await this.tonPrice(),
      waitingValidation: trips.length - valid.length,
      rows: valid.map((t) => {
        const movements = t.tripsCount ?? 0, per = t.tonnagePerTrip ?? 0;
        return {
          id: t.id, date: this.day(t.tripDate), vehicle: `${t.vehicle.internalNumber} — ${t.vehicle.registrationNumber}`,
          driver: `${t.driver.lastName} ${t.driver.firstName}`, destination: t.destination, movements,
          tons: Math.round(movements * per * 10) / 10, missingTonnage: !(per > 0),
        };
      }),
    };
  }

  async invoice(actor: Actor, dto: TransportInvoiceDto) {
    const customer = await this.prisma.customer.findUnique({ where: { id: dto.customerId } });
    if (!customer) throw new BadRequestException('Client introuvable.');
    const ids = [...new Set(dto.tripIds)];
    const trips = await this.prisma.trip.findMany({ where: { id: { in: ids } }, include: { vehicle: { select: { internalNumber: true } } } });
    if (trips.length !== ids.length) throw new BadRequestException('Un trajet est introuvable.');
    if (trips.some((t) => t.billedInvoiceId || t.status === 'CANCELLED')) throw new BadRequestException('Un des trajets est déjà facturé ou annulé.');
    const siteId = trips[0].siteId;
    if (trips.some((t) => t.siteId !== siteId)) throw new BadRequestException('Les trajets doivent appartenir au même site.');
    if (actor.role !== 'SUPER_ADMIN' && actor.siteId && siteId !== actor.siteId) throw new ForbiddenException("Ce site n'est pas dans votre périmètre.");
    const ok = await this.validatedKeys(trips);
    if (trips.some((t) => !ok.has(t.driverId + '|' + this.day(t.tripDate)))) throw new BadRequestException("Un trajet n'est pas encore validé par le Responsable des opérations.");
    if (trips.some((t) => !((t.tonnagePerTrip ?? 0) > 0) || !((t.tripsCount ?? 0) > 0))) throw new BadRequestException('Un trajet n\'a pas de tonnage : corrigez la fiche avant de facturer.');
    const price = dto.pricePerTon && dto.pricePerTon > 0 ? dto.pricePerTon : await this.tonPrice();
    if (!(price > 0)) throw new BadRequestException("Le prix par tonne n'est pas fixé.");
    const tons = Math.round(trips.reduce((a, t) => a + (t.tripsCount as number) * (t.tonnagePerTrip as number), 0) * 10) / 10;
    const total = Math.round(tons * price);
    const moves = trips.reduce((a, t) => a + (t.tripsCount as number), 0);
    const dates = trips.map((t) => +t.tripDate).sort((a, b) => a - b);
    const fr = (x: number) => new Date(x).toLocaleDateString('fr-FR');
    const trucks = [...new Set(trips.map((t) => t.vehicle.internalNumber))].join(', ');
    const description = `Transport du ${fr(dates[0])} au ${fr(dates[dates.length - 1])} : ${tons} t × ${Math.round(price).toLocaleString('fr-FR')} GNF/t, ${moves} mouvement(s), camion(s) ${trucks}.`;
    const year = new Date().getFullYear();
    const count = await this.prisma.salesInvoice.count({ where: { reference: { startsWith: `FV-${year}-` } } });
    const reference = `FV-${year}-${String(count + 1).padStart(4, '0')}`;
    const invoice = await this.prisma.$transaction(async (tx) => {
      const inv = await tx.salesInvoice.create({
        data: {
          siteId, customerId: customer.id, reference, invoiceDate: new Date(), dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
          paymentTerm: dto.dueDate ? 'CREDIT' : 'CASH', subtotal: total, totalAmount: total, status: 'UNPAID', createdById: actor.userId, description,
        },
      });
      const upd = await tx.trip.updateMany({ where: { id: { in: ids }, billedInvoiceId: null }, data: { billedInvoiceId: inv.id } });
      if (upd.count !== ids.length) throw new BadRequestException('Un trajet vient d\'être facturé par quelqu\'un d\'autre. Actualisez la liste.');
      return inv;
    });
    await this.audit.log({ userId: actor.userId, action: 'CREATE', entity: 'SalesInvoice', entityId: invoice.id, newValue: { event: 'TRANSPORT_INVOICE', trips: ids.length, tons, price, total } });
    return invoice;
  }
}
