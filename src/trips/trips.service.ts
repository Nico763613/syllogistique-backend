import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { AuditService } from '../audit/audit.service';
import { getIssuer } from '../common/issuer';
import { startDoc, keyValues, signatures, NAVY } from '../common/pdf-doc';
import { CreateTripDto, CloseTripDto, CorrectTripDto } from './dto/trip.dto';

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
        status: dto.endMileage !== undefined ? 'COMPLETED' : 'IN_PROGRESS',
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
      data: { endTime: new Date(dto.endTime), endMileage: dto.endMileage, distance, observations: dto.observations, status: 'COMPLETED', endCondition: dto.endCondition },
    });

    await this.prisma.vehicle.update({
      where: { id: trip.vehicleId },
      data: { currentMileage: dto.endMileage, status: dto.endCondition === 'PANNE' || dto.endCondition === 'DOMMAGE_MAJEUR' ? 'MAINTENANCE' : 'AVAILABLE' },
    });

    await this.audit.log({ userId: actorId, action: 'UPDATE', entity: 'Trip', entityId: id, newValue: dto });
    return updated;
  }

  // Correction d'une erreur de saisie : motif obligatoire, distance recalculée automatiquement.
  async correct(id: string, dto: CorrectTripDto, actorId: string) {
    const trip = await this.prisma.trip.findUnique({ where: { id } });
    if (!trip) throw new NotFoundException('Mission introuvable.');

    const startMileage = dto.startMileage ?? trip.startMileage;
    const endMileage = dto.endMileage ?? trip.endMileage ?? undefined;
    if (endMileage !== undefined && endMileage < startMileage) {
      throw new BadRequestException(
        'Le kilométrage d\'arrivée ne peut pas être inférieur au kilométrage de départ.',
      );
    }
    const distance = endMileage !== undefined ? endMileage - startMileage : undefined;

    const updated = await this.prisma.trip.update({
      where: { id },
      data: {
        startMileage,
        endMileage,
        distance,
        ...(dto.startTime ? { startTime: new Date(dto.startTime) } : {}),
        ...(dto.endTime ? { endTime: new Date(dto.endTime) } : {}),
        ...(dto.destination !== undefined ? { destination: dto.destination } : {}),
        ...(dto.purpose !== undefined ? { purpose: dto.purpose } : {}),
        ...(dto.passengerName !== undefined ? { passengerName: dto.passengerName } : {}),
        ...(dto.observations !== undefined ? { observations: dto.observations } : {}),
      },
    });

    await this.audit.log({
      userId: actorId,
      action: 'UPDATE',
      entity: 'Trip',
      entityId: id,
      oldValue: trip,
      newValue: updated,
      reason: dto.reason.trim(),
    });
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

  // Fiche de bord imprimable (mission : véhicule, chauffeur, kilométrage, destination, signatures)
  async sheetPdf(id: string, userId: string): Promise<Buffer> {
    const trip = await this.prisma.trip.findUnique({
      where: { id },
      include: { vehicle: true, driver: true, site: { include: { organization: true } } },
    });
    if (!trip) throw new NotFoundException('Mission introuvable.');
    const issuer = await getIssuer(this.prisma, userId);
    const fuel = await this.prisma.fuelTransaction.findMany({
      where: { vehicleId: trip.vehicleId, transactionDate: { gte: trip.tripDate, lt: new Date(trip.tripDate.getTime() + 86400000) } },
    });
    const liters = fuel.reduce((s, f) => s + Number(f.quantityLiters), 0);
    const hm = (d?: Date | null) => (d ? new Date(d).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '');

    const { doc, done } = startDoc(trip.site.organization?.name ?? 'SYLLOGISTIQUE', 'FICHE DE BORD');
    keyValues(doc, [
      ['Date', new Date(trip.tripDate).toLocaleDateString('fr-FR')],
      ['Site', trip.site.name],
      ['Véhicule', `${trip.vehicle.internalNumber} — ${trip.vehicle.registrationNumber}${trip.vehicle.registrationType === 'IT' ? ' (plaque IT)' : ''}`],
      ['Chauffeur', `${trip.driver.firstName} ${trip.driver.lastName}`],
      ['N° de permis', trip.driver.licenseNumber ?? ''],
      ['Destination', trip.destination ?? ''],
      ['Objet de la mission', trip.purpose ?? ''],
      ['Passager / bénéficiaire', trip.passengerName ?? ''],
    ]);
    doc.moveDown();
    doc.fillColor(NAVY).fontSize(12).text('Départ / Retour', { underline: true }).fillColor('#000000').fontSize(10);
    keyValues(doc, [
      ['Heure de départ', hm(trip.startTime)],
      ['Heure de retour', hm(trip.endTime)],
      ['Km au départ', String(trip.startMileage)],
      ['Km au retour', trip.endMileage === null ? '' : String(trip.endMileage)],
      ['Distance parcourue', trip.distance === null ? '' : trip.distance + ' km'],
      ['Carburant servi ce jour', liters ? liters + ' L' : ''],
    ]);
    if (trip.observations) { doc.moveDown(); keyValues(doc, [['Observations', trip.observations]]); }
    signatures(doc, issuer, 'Chauffeur (signature)');
    doc.end();
    return done;
  }
}
