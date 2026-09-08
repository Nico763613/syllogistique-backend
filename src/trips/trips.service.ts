import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateTripDto, CloseTripDto } from './dto/trip.dto';

@Injectable()
export class TripsService {
  constructor(private prisma: PrismaService, private audit: AuditService) {}

  async create(dto: CreateTripDto, actorId: string) {
    const vehicle = await this.prisma.vehicle.findUnique({ where: { id: dto.vehicleId } });
    if (!vehicle) throw new BadRequestException('Véhicule inexistant.');

    const driver = await this.prisma.driver.findUnique({ where: { id: dto.driverId } });
    if (!driver) throw new BadRequestException('Chauffeur inexistant.');

    if (dto.endMileage !== undefined && dto.endMileage < dto.startMileage) {
      throw new BadRequestException(
        'Le kilométrage d\'arrivée ne peut pas être inférieur au kilométrage de départ.',
      );
    }

    const distance = dto.endMileage !== undefined ? dto.endMileage - dto.startMileage : undefined;

    const trip = await this.prisma.trip.create({
      data: {
        vehicleId: dto.vehicleId,
        driverId: dto.driverId,
        siteId: dto.siteId,
        tripDate: new Date(dto.tripDate),
        startTime: new Date(dto.startTime),
        endTime: dto.endTime ? new Date(dto.endTime) : undefined,
        startMileage: dto.startMileage,
        endMileage: dto.endMileage,
        distance,
        destination: dto.destination,
        purpose: dto.purpose,
        passengerName: dto.passengerName,
        observations: dto.observations,
        createdById: actorId,
      },
    });

    // Le véhicule est mis en mission dès le départ enregistré
    await this.prisma.vehicle.update({
      where: { id: dto.vehicleId },
      data: { status: 'ON_MISSION' },
    });

    if (dto.endMileage !== undefined) {
      await this.prisma.vehicle.update({ where: { id: dto.vehicleId }, data: { currentMileage: dto.endMileage } });
    }

    await this.audit.log({ userId: actorId, action: 'CREATE', entity: 'Trip', entityId: trip.id, newValue: dto });
    return trip;
  }

  // Clôturer une mission en cours (retour du véhicule)
  async close(id: string, dto: CloseTripDto, actorId: string) {
    const trip = await this.prisma.trip.findUnique({ where: { id } });
    if (!trip) throw new NotFoundException('Mission introuvable.');

    if (dto.endMileage < trip.startMileage) {
      throw new BadRequestException(
        'Le kilométrage d\'arrivée ne peut pas être inférieur au kilométrage de départ.',
      );
    }

    const distance = dto.endMileage - trip.startMileage;

    const updated = await this.prisma.trip.update({
      where: { id },
      data: { endTime: new Date(dto.endTime), endMileage: dto.endMileage, distance, observations: dto.observations },
    });

    await this.prisma.vehicle.update({
      where: { id: trip.vehicleId },
      data: { currentMileage: dto.endMileage, status: 'AVAILABLE' },
    });

    await this.audit.log({ userId: actorId, action: 'UPDATE', entity: 'Trip', entityId: id, newValue: dto });
    return updated;
  }

  findAll(params: { siteId?: string; vehicleId?: string; driverId?: string; from?: string; to?: string }) {
    return this.prisma.trip.findMany({
      where: {
        ...(params.siteId ? { siteId: params.siteId } : {}),
        ...(params.vehicleId ? { vehicleId: params.vehicleId } : {}),
        ...(params.driverId ? { driverId: params.driverId } : {}),
        ...(params.from || params.to
          ? {
              tripDate: {
                ...(params.from ? { gte: new Date(params.from) } : {}),
                ...(params.to ? { lte: new Date(params.to) } : {}),
              },
            }
          : {}),
      },
      include: {
        vehicle: { select: { internalNumber: true, registrationNumber: true } },
        driver: { select: { firstName: true, lastName: true } },
      },
      orderBy: { tripDate: 'desc' },
    });
  }

  async findOne(id: string) {
    const trip = await this.prisma.trip.findUnique({
      where: { id },
      include: { vehicle: true, driver: true },
    });
    if (!trip) throw new NotFoundException('Mission introuvable.');
    return trip;
  }
}
