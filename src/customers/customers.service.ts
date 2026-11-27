import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { allowedSiteIds } from '../common/tenant-scope';
import { PrismaService } from '../prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateCustomerDto, UpdateCustomerDto } from './dto/customer.dto';

@Injectable()
export class CustomersService {
  constructor(private prisma: PrismaService, private audit: AuditService) {}

  // Anti-doublon : même téléphone (9 derniers chiffres) ou même nom (sans accents, espaces ni casse) sur le même site.
  private norm(s?: string | null) { return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, ''); }
  private digits(s?: string | null) { return String(s || '').replace(/\D/g, '').slice(-9); }
  async findDuplicates(siteId: string, name?: string, phone?: string, excludeId?: string) {
    // Requête SQL directe (non filtrée automatiquement) : le site doit appartenir au périmètre de l'utilisateur,
    // sinon on pourrait lire les noms et téléphones des clients d'une autre entreprise.
    const allowed = await allowedSiteIds(this.prisma);
    if (allowed && !allowed.includes(siteId)) throw new ForbiddenException("Ce site n'est pas dans votre périmètre.");
    const nn = this.norm(name), pp = this.digits(phone);
    if (!nn && pp.length < 8) return [];
    const all = (await this.prisma.$queryRawUnsafe('SELECT "id","name","phone","kind" FROM "customers" WHERE "site_id" = $1', siteId) as any[]).filter((c) => c.id !== excludeId);
    return all.filter((c) => (nn && this.norm(c.name) === nn) || (pp.length >= 8 && this.digits(c.phone) === pp))
      .map((c) => ({ id: c.id, name: c.name, phone: c.phone, kind: c.kind, why: pp.length >= 8 && this.digits(c.phone) === pp ? 'même téléphone' : 'même nom' }));
  }

  async create(dto: CreateCustomerDto, actorId: string) {
    const { force, kind, ...data } = dto as any;
    if (!force) {
      const dup = await this.findDuplicates(dto.siteId, dto.name, dto.phone);
      if (dup.length) throw new ConflictException({ message: `Ce client existe peut-être déjà : ${dup.map((d) => `${d.name} (${d.why})`).join(', ')}. Vérifiez avant de créer un doublon.`, duplicates: dup });
    }
    const customer = await this.prisma.customer.create({ data });
    if (kind === 'PROSPECT') await this.prisma.$executeRawUnsafe('UPDATE "customers" SET "kind" = \'PROSPECT\' WHERE "id" = $1', customer.id);
    await this.audit.log({ userId: actorId, action: 'CREATE', entity: 'Customer', entityId: customer.id, newValue: { ...data, kind: kind || 'CLIENT' } });
    return { ...customer, kind: kind === 'PROSPECT' ? 'PROSPECT' : 'CLIENT' };
  }

  async findAll(siteId?: string) {
    const rows = await this.prisma.customer.findMany({
      where: siteId ? { siteId } : {},
      orderBy: { name: 'asc' },
    });
    const kinds = (await this.prisma.$queryRawUnsafe('SELECT "id","kind" FROM "customers" WHERE "id" = ANY($1::text[])', rows.map((r) => r.id))) as any[];
    const map = new Map(kinds.map((k) => [k.id, k.kind]));
    return rows.map((c) => ({ ...c, kind: map.get(c.id) || 'CLIENT' }));
  }

  async findOne(id: string) {
    const customer = await this.prisma.customer.findUnique({
      where: { id },
      include: {
        salesOrders: { take: 10, orderBy: { orderDate: 'desc' } },
        salesInvoices: { take: 10, orderBy: { invoiceDate: 'desc' } },
      },
    });
    if (!customer) throw new NotFoundException('Client introuvable.');

    const totalDue = customer.salesInvoices
      .filter((i) => i.status === 'UNPAID' || i.status === 'PARTIALLY_PAID')
      .reduce((sum, i) => sum + (Number(i.totalAmount) - Number(i.amountPaid)), 0);

    return { ...customer, totalDue };
  }

  async update(id: string, dto: UpdateCustomerDto, actorId: string) {
    const before = await this.prisma.customer.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('Client introuvable.');
    const { force, kind, ...data } = dto as any;
    if (!force && (data.name !== undefined || data.phone !== undefined)) {
      const dup = await this.findDuplicates(before.siteId, data.name ?? before.name, data.phone ?? before.phone, id);
      if (dup.length) throw new ConflictException({ message: `Un autre client correspond déjà : ${dup.map((d) => `${d.name} (${d.why})`).join(', ')}.`, duplicates: dup });
    }
    const customer = await this.prisma.customer.update({ where: { id }, data });
    if (kind === 'CLIENT' || kind === 'PROSPECT') await this.prisma.$executeRawUnsafe('UPDATE "customers" SET "kind" = $2 WHERE "id" = $1', id, kind);
    await this.audit.log({ userId: actorId, action: 'UPDATE', entity: 'Customer', entityId: id, oldValue: before, newValue: { ...data, ...(kind ? { kind } : {}) } });
    return customer;
  }
}
