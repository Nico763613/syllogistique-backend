import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma.service';
import { AuditService } from '../audit/audit.service';
import { CompleteMaintenanceDto, CreateMaintenancePlanDto, SchedulePlanDto, UpdateMaintenancePlanDto } from './dto/maintenance-plan.dto';

const DAY = 86_400_000;
type Level = 'OK' | 'SOON' | 'OVERDUE';
type Sev = 'INFO' | 'WARNING' | 'CRITICAL';
type Actor = { userId: string; role?: string };

// Calcul de l'échéance d'un plan : prochain entretien au kilométrage et/ou à la date, reste, niveau d'alerte
export function planState(
  p: { intervalKm: number | null; intervalDays: number | null; alertKm: number; alertDays: number; lastDoneKm: number | null; lastDoneAt: Date | null },
  vehicle: { currentMileage: number },
  now = new Date(),
) {
  const kmDue = p.intervalKm && p.lastDoneKm != null ? p.lastDoneKm + p.intervalKm : null;
  const dateDue = p.intervalDays && p.lastDoneAt ? new Date(+p.lastDoneAt + p.intervalDays * DAY) : null;
  const kmLeft = kmDue != null ? kmDue - vehicle.currentMileage : null;
  const daysLeft = dateDue ? Math.ceil((+dateDue - +now) / DAY) : null;
  let level: Level = 'OK';
  if ((kmLeft != null && kmLeft <= 0) || (daysLeft != null && daysLeft < 0)) level = 'OVERDUE';
  else if ((kmLeft != null && kmLeft <= p.alertKm) || (daysLeft != null && daysLeft <= p.alertDays)) level = 'SOON';
  return { kmDue, dateDue, kmLeft, daysLeft, level };
}

// Circuit « entretien préventif » :
// Seuils par véhicule → alerte avant l'échéance (Responsable logistique) → planification (l'atelier est prévenu) →
// le mécanicien déclare « Entretien effectué » → le plan repart de zéro (prochaine échéance recalculée).
// Retards (échéance dépassée, entretien planifié non réalisé) alertés ; tout est audité.
@Injectable()
export class MaintenancePlansService {
  private readonly logger = new Logger(MaintenancePlansService.name);
  constructor(private prisma: PrismaService, private audit: AuditService) {}

  // --- Alertes ---

  private async emit(created: { n: number }, a: { role: string; siteId: string; title: string; message: string; severity: Sev; entityId: string; entity?: string }) {
    const since = new Date(Date.now() - DAY);
    const entity = a.entity ?? 'MaintenancePlan';
    const roles = a.severity === 'CRITICAL' && a.role !== 'SUPER_ADMIN' ? [a.role, 'SUPER_ADMIN'] : [a.role];
    for (const roleName of roles) {
      const dup = await this.prisma.notification.findFirst({ where: { entity, entityId: a.entityId, roleName, createdAt: { gte: since } } });
      if (dup) continue;
      await this.prisma.notification.create({ data: { title: a.title, message: a.message, severity: a.severity, entity, entityId: a.entityId, siteId: a.siteId, roleName } });
      created.n += 1;
    }
  }

  private async notifyNow(roles: string[], siteId: string, entityId: string, title: string, message: string, severity: Sev) {
    for (const roleName of roles) {
      await this.prisma.notification
        .create({ data: { title, message, severity, entity: 'MaintenancePlan', entityId, siteId, roleName } })
        .catch(() => undefined);
    }
  }

  // Toutes les 6 h : échéances proches / dépassées et entretiens planifiés non réalisés
  @Cron('15 */6 * * *')
  async scheduledChecks() {
    try {
      const n = await this.runChecks();
      this.logger.log(`Entretien préventif : ${n} alerte(s) générée(s).`);
    } catch (e) {
      this.logger.error(`Contrôle de l'entretien préventif en échec : ${(e as Error).message}`);
    }
  }

  async runChecks(): Promise<number> {
    const created = { n: 0 };
    const now = new Date();
    const plans = await this.prisma.maintenancePlan.findMany({
      where: { active: true, vehicle: { deletedAt: null } },
      include: { vehicle: true, maintenanceType: true },
    });
    const plannedIds = plans.map((p) => p.plannedMaintenanceId).filter((x): x is string => !!x);
    const planned = plannedIds.length ? await this.prisma.maintenance.findMany({ where: { id: { in: plannedIds } } }) : [];
    const plannedBy = new Map(planned.map((m) => [m.id, m]));
    const fr = (d: Date) => d.toLocaleDateString('fr-FR');
    for (const p of plans) {
      const st = planState(p, p.vehicle, now);
      const pm = p.plannedMaintenanceId ? plannedBy.get(p.plannedMaintenanceId) : undefined;
      const isPlanned = !!pm && ['PLANNED', 'IN_PROGRESS'].includes(pm.status);
      const label = `${p.vehicle.internalNumber} — ${p.maintenanceType.label}`;
      const left = [st.kmLeft != null ? (st.kmLeft <= 0 ? `dépassé de ${(-st.kmLeft).toLocaleString('fr-FR')} km` : `il reste ${st.kmLeft.toLocaleString('fr-FR')} km`) : '', st.daysLeft != null ? (st.daysLeft < 0 ? `dépassé de ${-st.daysLeft} j` : `il reste ${st.daysLeft} j`) : ''].filter(Boolean).join(' · ');
      if (st.level !== 'OK' && !isPlanned) {
        for (const role of ['ADMIN_LOGISTIQUE', 'GESTIONNAIRE_FLOTTE']) {
          await this.emit(created, {
            role, siteId: p.vehicle.siteId, entityId: p.id, severity: st.level === 'OVERDUE' ? 'CRITICAL' : 'WARNING',
            title: st.level === 'OVERDUE' ? 'Entretien préventif en retard' : 'Entretien préventif à planifier',
            message: `${label} : ${left}. À planifier : l'atelier sera prévenu.`,
          });
        }
      }
      // Entretien planifié mais date dépassée et toujours pas réalisé
      if (pm && isPlanned && pm.maintenanceDate < new Date(now.getFullYear(), now.getMonth(), now.getDate())) {
        for (const role of ['MECANICIEN', 'GESTIONNAIRE_FLOTTE', 'ADMIN_LOGISTIQUE']) {
          await this.emit(created, {
            role, siteId: p.vehicle.siteId, entityId: pm.id, entity: 'MaintenancePlanned', severity: 'WARNING',
            title: 'Entretien planifié non réalisé', message: `${label} : prévu le ${fr(pm.maintenanceDate)}, toujours pas déclaré effectué.`,
          });
        }
      }
    }
    return created.n;
  }

  // --- Plans ---

  private static nextStep(level: Level, planned: { maintenanceDate: Date; status: string } | null) {
    if (planned) return { who: 'Mécanicien', text: `Réaliser l'entretien prévu le ${planned.maintenanceDate.toLocaleDateString('fr-FR')}, puis déclarer « Entretien effectué ».` };
    if (level === 'OK') return null;
    return { who: 'Responsable logistique', text: 'Planifier l\'entretien (date et consigne) : l\'atelier sera prévenu.' };
  }

  async list(siteId: string, vehicleId?: string) {
    if (!siteId) throw new BadRequestException('Le site (siteId) est obligatoire.');
    const plans = await this.prisma.maintenancePlan.findMany({
      where: { vehicle: { siteId, deletedAt: null }, ...(vehicleId ? { vehicleId } : {}) },
      include: { vehicle: { select: { id: true, internalNumber: true, registrationNumber: true, currentMileage: true, vehicleType: true } }, maintenanceType: { select: { code: true, label: true } } },
    });
    const plannedIds = plans.map((p) => p.plannedMaintenanceId).filter((x): x is string => !!x);
    const planned = plannedIds.length ? await this.prisma.maintenance.findMany({ where: { id: { in: plannedIds } } }) : [];
    const plannedBy = new Map(planned.map((m) => [m.id, m]));
    const now = new Date();
    const rank: Record<Level, number> = { OVERDUE: 0, SOON: 1, OK: 2 };
    const items = plans
      .map((p) => {
        const st = planState(p, p.vehicle, now);
        const pm = p.plannedMaintenanceId ? plannedBy.get(p.plannedMaintenanceId) : undefined;
        const pending = pm && ['PLANNED', 'IN_PROGRESS'].includes(pm.status) ? { id: pm.id, maintenanceDate: pm.maintenanceDate, status: pm.status } : null;
        return {
          id: p.id, active: p.active,
          vehicleId: p.vehicleId, vehicle: p.vehicle.internalNumber, registration: p.vehicle.registrationNumber, vehicleType: p.vehicle.vehicleType, currentMileage: p.vehicle.currentMileage,
          typeCode: p.maintenanceType.code, type: p.maintenanceType.label,
          intervalKm: p.intervalKm, intervalDays: p.intervalDays, alertKm: p.alertKm, alertDays: p.alertDays,
          lastDoneKm: p.lastDoneKm, lastDoneAt: p.lastDoneAt,
          nextKm: st.kmDue, nextDate: st.dateDue, kmLeft: st.kmLeft, daysLeft: st.daysLeft,
          level: p.active ? st.level : 'OK',
          planned: pending,
          next: p.active ? MaintenancePlansService.nextStep(st.level, pending) : null,
        };
      })
      .sort((a, b) => Number(b.active) - Number(a.active) || rank[a.level as Level] - rank[b.level as Level] || a.vehicle.localeCompare(b.vehicle));
    return {
      items,
      summary: {
        total: items.length,
        overdue: items.filter((i) => i.active && i.level === 'OVERDUE').length,
        soon: items.filter((i) => i.active && i.level === 'SOON').length,
        toPlan: items.filter((i) => i.active && i.level !== 'OK' && !i.planned).length,
        planned: items.filter((i) => i.planned).length,
      },
    };
  }

  async create(dto: CreateMaintenancePlanDto, actor: Actor) {
    if (!dto.intervalKm && !dto.intervalDays) throw new BadRequestException('Indiquez un seuil : tous les X km et/ou tous les Y jours.');
    const [vehicle, type] = await Promise.all([
      this.prisma.vehicle.findUnique({ where: { id: dto.vehicleId } }),
      this.prisma.maintenanceType.findUnique({ where: { code: dto.maintenanceTypeCode } }),
    ]);
    if (!vehicle || vehicle.deletedAt) throw new NotFoundException('Véhicule introuvable.');
    if (!type) throw new BadRequestException('Type d\'entretien inconnu.');
    const exists = await this.prisma.maintenancePlan.findUnique({ where: { vehicleId_maintenanceTypeId: { vehicleId: vehicle.id, maintenanceTypeId: type.id } } });
    if (exists) throw new ConflictException(`Un plan « ${type.label} » existe déjà pour ${vehicle.internalNumber} : modifiez-le.`);
    const plan = await this.prisma.maintenancePlan.create({
      data: {
        vehicleId: vehicle.id, maintenanceTypeId: type.id, intervalKm: dto.intervalKm, intervalDays: dto.intervalDays,
        ...(dto.alertKm !== undefined ? { alertKm: dto.alertKm } : {}), ...(dto.alertDays !== undefined ? { alertDays: dto.alertDays } : {}),
        // Point de départ : dernier entretien connu, sinon l'état actuel du véhicule
        lastDoneKm: dto.lastDoneKm ?? vehicle.currentMileage, lastDoneAt: dto.lastDoneAt ? new Date(dto.lastDoneAt) : new Date(),
        createdById: actor.userId,
      },
    });
    await this.audit.log({ userId: actor.userId, action: 'CREATE', entity: 'MaintenancePlan', entityId: plan.id, newValue: { vehicule: vehicle.internalNumber, type: type.label, intervalKm: dto.intervalKm, intervalDays: dto.intervalDays } });
    return plan;
  }

  async update(id: string, dto: UpdateMaintenancePlanDto, actor: Actor) {
    const plan = await this.prisma.maintenancePlan.findUnique({ where: { id } });
    if (!plan) throw new NotFoundException('Plan d\'entretien introuvable.');
    const next = { intervalKm: dto.intervalKm ?? plan.intervalKm, intervalDays: dto.intervalDays ?? plan.intervalDays };
    if (!next.intervalKm && !next.intervalDays) throw new BadRequestException('Un plan doit garder au moins un seuil (km ou jours).');
    const updated = await this.prisma.maintenancePlan.update({ where: { id }, data: { ...dto } });
    await this.audit.log({ userId: actor.userId, action: 'UPDATE', entity: 'MaintenancePlan', entityId: id, oldValue: { intervalKm: plan.intervalKm, intervalDays: plan.intervalDays, active: plan.active }, newValue: dto });
    return updated;
  }

  // --- Étape 2 : planification par la logistique ---

  async schedule(id: string, dto: SchedulePlanDto, actor: Actor) {
    const plan = await this.prisma.maintenancePlan.findUnique({ where: { id }, include: { vehicle: true, maintenanceType: true } });
    if (!plan || !plan.active) throw new NotFoundException('Plan d\'entretien introuvable ou désactivé.');
    if (plan.plannedMaintenanceId) {
      const pm = await this.prisma.maintenance.findUnique({ where: { id: plan.plannedMaintenanceId } });
      if (pm && ['PLANNED', 'IN_PROGRESS'].includes(pm.status)) throw new BadRequestException('Cet entretien est déjà planifié.');
    }
    const date = new Date(dto.maintenanceDate);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    if (Number.isNaN(+date) || +date < +today - DAY) throw new BadRequestException('La date prévue ne peut pas être dans le passé.');
    const st = planState(plan, plan.vehicle);
    const record = await this.prisma.maintenance.create({
      data: {
        vehicleId: plan.vehicleId, maintenanceTypeId: plan.maintenanceTypeId, maintenanceDate: date, status: 'PLANNED', kind: 'PREVENTIVE',
        description: dto.note?.trim() || `Entretien préventif — ${plan.maintenanceType.label}`,
      },
    });
    await this.prisma.maintenancePlan.update({ where: { id }, data: { plannedMaintenanceId: record.id } });
    await this.audit.log({ userId: actor.userId, action: 'CREATE', entity: 'Maintenance', entityId: record.id, newValue: { planifie: true, vehicule: plan.vehicle.internalNumber, type: plan.maintenanceType.label, date: dto.maintenanceDate }, reason: dto.note?.trim() });
    await this.notifyNow(['MECANICIEN'], plan.vehicle.siteId, plan.id, `Entretien à réaliser — ${plan.vehicle.internalNumber}`,
      `${plan.maintenanceType.label} prévu le ${date.toLocaleDateString('fr-FR')}.${dto.note?.trim() ? ` Consigne : ${dto.note.trim().slice(0, 140)}` : ''}`, st.level === 'OVERDUE' ? 'CRITICAL' : 'WARNING');
    return record;
  }

  // --- Étape 3 : le mécanicien déclare l'entretien effectué → le plan repart de zéro ---

  async complete(maintenanceId: string, dto: CompleteMaintenanceDto, actor: Actor) {
    const m = await this.prisma.maintenance.findUnique({ where: { id: maintenanceId }, include: { vehicle: true, maintenanceType: true } });
    if (!m) throw new NotFoundException('Entretien introuvable.');
    if (!['PLANNED', 'IN_PROGRESS'].includes(m.status)) throw new BadRequestException('Cet entretien est déjà déclaré effectué.');
    const parts = Math.round(dto.partsCost ?? 0), labor = Math.round(dto.laborCost ?? 0);
    if (actor.role === 'MECANICIEN' && parts + labor > 0 && !dto.invoiceUrl) throw new BadRequestException('La photo de la facture est obligatoire quand un coût est indiqué.');
    const now = new Date();
    const km = dto.mileage ?? m.vehicle.currentMileage;
    const plan = await this.prisma.maintenancePlan.findFirst({ where: { vehicleId: m.vehicleId, maintenanceTypeId: m.maintenanceTypeId } });
    const done = await this.prisma.maintenance.update({
      where: { id: maintenanceId },
      data: {
        status: 'COMPLETED', maintenanceDate: now, mileage: km, partsCost: parts, laborCost: labor, cost: parts + labor || undefined,
        ...(dto.description?.trim() ? { description: `${m.description ? m.description + ' — ' : ''}${dto.description.trim()}` } : {}),
        invoiceUrl: dto.invoiceUrl || undefined,
        ...(plan?.intervalKm ? { nextMileage: km + plan.intervalKm } : {}), ...(plan?.intervalDays ? { nextDate: new Date(+now + plan.intervalDays * DAY) } : {}),
      },
    });
    if (km > m.vehicle.currentMileage) await this.prisma.vehicle.update({ where: { id: m.vehicleId }, data: { currentMileage: km } });
    if (plan) await this.prisma.maintenancePlan.update({ where: { id: plan.id }, data: { lastDoneKm: km, lastDoneAt: now, plannedMaintenanceId: null } });
    await this.audit.log({ userId: actor.userId, action: 'UPDATE', entity: 'Maintenance', entityId: maintenanceId, oldValue: { status: m.status }, newValue: { status: 'COMPLETED', km, cout: parts + labor } });
    await this.notifyNow(['ADMIN_LOGISTIQUE', 'GESTIONNAIRE_FLOTTE'], m.vehicle.siteId, plan?.id ?? maintenanceId, `Entretien effectué — ${m.vehicle.internalNumber}`,
      `${m.maintenanceType.label} réalisé à ${km.toLocaleString('fr-FR')} km${parts + labor ? `, coût ${(parts + labor).toLocaleString('fr-FR')} GNF` : ''}.${plan ? ' Prochaine échéance recalculée.' : ''}`, 'INFO');
    return done;
  }

  // Un entretien enregistré directement (formulaire existant) remet aussi le plan correspondant à zéro
  async onDirectMaintenance(vehicleId: string, maintenanceTypeId: string, km: number | undefined, at: Date) {
    const plan = await this.prisma.maintenancePlan.findFirst({ where: { vehicleId, maintenanceTypeId, active: true }, include: { vehicle: { select: { currentMileage: true } } } });
    if (!plan) return null;
    const doneKm = km ?? plan.vehicle.currentMileage;
    if (plan.plannedMaintenanceId) {
      await this.prisma.maintenance
        .updateMany({ where: { id: plan.plannedMaintenanceId, status: { in: ['PLANNED', 'IN_PROGRESS'] } }, data: { status: 'COMPLETED', description: 'Entretien planifié clôturé : réalisé et saisi directement.' } })
        .catch(() => undefined);
    }
    await this.prisma.maintenancePlan.update({ where: { id: plan.id }, data: { lastDoneKm: doneKm, lastDoneAt: at, plannedMaintenanceId: null } });
    return {
      nextMileage: plan.intervalKm ? doneKm + plan.intervalKm : undefined,
      nextDate: plan.intervalDays ? new Date(+at + plan.intervalDays * DAY) : undefined,
    };
  }
}
