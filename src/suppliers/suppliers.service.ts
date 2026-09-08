import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateSupplierDto, UpdateSupplierDto } from './dto/supplier.dto';

@Injectable()
export class SuppliersService {
  constructor(private prisma: PrismaService, private audit: AuditService) {}

  async create(dto: CreateSupplierDto, actorId: string) {
    const supplier = await this.prisma.supplier.create({ data: dto });
    await this.audit.log({ userId: actorId, action: 'CREATE', entity: 'Supplier', entityId: supplier.id, newValue: dto });
    return supplier;
  }

  findAll() {
    return this.prisma.supplier.findMany({ orderBy: { name: 'asc' } });
  }

  async findOne(id: string) {
    const supplier = await this.prisma.supplier.findUnique({
      where: { id },
      include: { stockMovements: { take: 20, orderBy: { createdAt: 'desc' } }, maintenances: { take: 10, orderBy: { maintenanceDate: 'desc' } } },
    });
    if (!supplier) throw new NotFoundException('Fournisseur introuvable.');

    const totalPurchased = supplier.stockMovements
      .filter((m) => m.movementType === 'IN')
      .reduce((sum, m) => sum + Number(m.totalValue ?? 0), 0);

    return { ...supplier, totalPurchased };
  }

  async update(id: string, dto: UpdateSupplierDto, actorId: string) {
    const before = await this.prisma.supplier.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('Fournisseur introuvable.');
    const supplier = await this.prisma.supplier.update({ where: { id }, data: dto });
    await this.audit.log({ userId: actorId, action: 'UPDATE', entity: 'Supplier', entityId: id, oldValue: before, newValue: dto });
    return supplier;
  }
}
