import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateCustomerDto, UpdateCustomerDto } from './dto/customer.dto';

@Injectable()
export class CustomersService {
  constructor(private prisma: PrismaService, private audit: AuditService) {}

  async create(dto: CreateCustomerDto, actorId: string) {
    const customer = await this.prisma.customer.create({ data: dto });
    await this.audit.log({ userId: actorId, action: 'CREATE', entity: 'Customer', entityId: customer.id, newValue: dto });
    return customer;
  }

  findAll(siteId?: string) {
    return this.prisma.customer.findMany({
      where: siteId ? { siteId } : {},
      orderBy: { name: 'asc' },
    });
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
    const customer = await this.prisma.customer.update({ where: { id }, data: dto });
    await this.audit.log({ userId: actorId, action: 'UPDATE', entity: 'Customer', entityId: id, oldValue: before, newValue: dto });
    return customer;
  }
}
