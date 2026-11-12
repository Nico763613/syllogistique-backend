import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateDriverDto, UpdateDriverDto, MarkAttendanceDto } from './dto/driver.dto';

@Injectable()
export class DriversService {
  constructor(private prisma: PrismaService, private audit: AuditService) {}

  create(dto: CreateDriverDto, actorId: string) {
    return this.prisma.driver
      .create({ data: { ...dto, licenseExpiryDate: dto.licenseExpiryDate ? new Date(dto.licenseExpiryDate) : undefined } })
      .then(async (driver) => {
        await this.audit.log({ userId: actorId, action: 'CREATE', entity: 'Driver', entityId: driver.id, newValue: dto });
        return driver;
      });
  }

  findAll(siteId?: string) {
    return this.prisma.driver.findMany({
      where: { deletedAt: null, ...(siteId ? { siteId } : {}) },
      include: { vehicles: { select: { id: true, internalNumber: true, registrationNumber: true } } },
      orderBy: { lastName: 'asc' },
    });
  }

  async findOne(id: string) {
    const driver = await this.prisma.driver.findUnique({
      where: { id },
      include: { vehicles: true, trips: { take: 10, orderBy: { tripDate: 'desc' } } },
    });
    if (!driver) throw new NotFoundException('Chauffeur introuvable.');
    return driver;
  }

  async update(id: string, dto: UpdateDriverDto, actorId: string) {
    const before = await this.prisma.driver.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('Chauffeur introuvable.');

    const driver = await this.prisma.driver.update({
      where: { id },
      data: { ...dto, licenseExpiryDate: dto.licenseExpiryDate ? new Date(dto.licenseExpiryDate) : undefined },
    });

    await this.audit.log({ userId: actorId, action: 'UPDATE', entity: 'Driver', entityId: id, oldValue: before, newValue: dto });
    return driver;
  }

  async remove(id: string, actorId: string) {
    await this.prisma.driver.update({ where: { id }, data: { deletedAt: new Date(), status: 'INACTIVE' } });
    await this.audit.log({ userId: actorId, action: 'DELETE', entity: 'Driver', entityId: id });
    return { success: true };
  }

  // ---- Pointage ----

  async attendanceDay(siteId: string | undefined, date?: string) {
    const d = new Date(date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : new Date().toISOString().slice(0, 10));
    const rows = await this.prisma.driverAttendance.findMany({ where: { date: d, ...(siteId ? { siteId } : {}) }, select: { driverId: true, status: true, absenceReason: true } });
    return rows;
  }

  async markAttendance(dto: MarkAttendanceDto, actorId: string) {
    if (dto.status === 'ABSENT' && !dto.absenceReason) {
      throw new BadRequestException("Le motif d'absence est obligatoire.");
    }

    const previous = await this.prisma.driverAttendance.findUnique({
      where: { driverId_date: { driverId: dto.driverId, date: new Date(dto.date) } },
    });
    if (previous && (!dto.correctionReason || dto.correctionReason.trim().length < 3)) {
      throw new BadRequestException('Pointage déjà saisi pour ce jour : un motif de correction est obligatoire.');
    }

    const attendance = await this.prisma.driverAttendance.upsert({
      where: { driverId_date: { driverId: dto.driverId, date: new Date(dto.date) } },
      update: {
        status: dto.status,
        absenceReason: dto.absenceReason,
        checkIn: dto.checkIn ? new Date(dto.checkIn) : undefined,
        checkOut: dto.checkOut ? new Date(dto.checkOut) : undefined,
      },
      create: {
        driverId: dto.driverId,
        siteId: dto.siteId,
        date: new Date(dto.date),
        status: dto.status,
        absenceReason: dto.absenceReason,
        checkIn: dto.checkIn ? new Date(dto.checkIn) : undefined,
        checkOut: dto.checkOut ? new Date(dto.checkOut) : undefined,
        createdById: actorId,
      },
    });

    await this.audit.log({
      userId: actorId,
      action: previous ? 'UPDATE' : 'CREATE',
      entity: 'DriverAttendance',
      entityId: attendance.id,
      oldValue: previous ?? undefined,
      newValue: dto,
      reason: previous ? dto.correctionReason?.trim() : undefined,
    });

    return attendance;
  }

  async attendanceStats(driverId: string, from: string, to: string) {
    const records = await this.prisma.driverAttendance.findMany({
      where: { driverId, date: { gte: new Date(from), lte: new Date(to) } },
    });

    const totalDays = records.length;
    const present = records.filter((r) => r.status === 'PRESENT').length;
    const absent = records.filter((r) => r.status === 'ABSENT').length;
    const leave = records.filter((r) => r.status === 'LEAVE').length;

    return {
      totalDays,
      present,
      absent,
      leave,
      presenceRate: totalDays > 0 ? Math.round((present / totalDays) * 100) : 0,
    };
  }
}
