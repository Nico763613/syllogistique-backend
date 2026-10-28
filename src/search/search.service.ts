import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

// Recherche globale (§31) : véhicule/plaque, chauffeur, article, fournisseur, mission.
@Injectable()
export class SearchService {
  constructor(private prisma: PrismaService) {}

  async search(q: string, siteId?: string) {
    const term = (q ?? '').trim();
    if (term.length < 2) throw new BadRequestException('Saisissez au moins 2 caractères.');
    const like = { contains: term, mode: 'insensitive' as const };
    const site = siteId ? { siteId } : {};

    const [vehicles, drivers, items, suppliers, trips] = await Promise.all([
      this.prisma.vehicle.findMany({
        where: { ...site, deletedAt: null, OR: [{ internalNumber: like }, { registrationNumber: like }, { brand: like }, { model: like }] },
        select: { id: true, internalNumber: true, registrationNumber: true, brand: true, model: true, vehicleType: true, status: true },
        take: 10,
      }),
      this.prisma.driver.findMany({
        where: { ...site, deletedAt: null, OR: [{ firstName: like }, { lastName: like }, { phone: like }, { licenseNumber: like }] },
        select: { id: true, firstName: true, lastName: true, phone: true, status: true },
        take: 10,
      }),
      this.prisma.inventoryItem.findMany({
        where: { ...site, OR: [{ name: like }, { sku: like }, { reference: like }, { brand: like }] },
        select: { id: true, sku: true, name: true, currentQuantity: true, unit: true },
        take: 10,
      }),
      this.prisma.supplier.findMany({
        where: { OR: [{ name: like }, { contactName: like }, { phone: like }, { productsSupplied: like }] },
        select: { id: true, name: true, phone: true },
        take: 10,
      }),
      this.prisma.trip.findMany({
        where: { ...site, OR: [{ destination: like }, { purpose: like }, { passengerName: like }] },
        select: { id: true, tripDate: true, destination: true, purpose: true, vehicleId: true, driverId: true },
        orderBy: { tripDate: 'desc' },
        take: 10,
      }),
    ]);

    return { query: term, vehicles, drivers, items, suppliers, trips };
  }
}
