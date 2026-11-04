import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { Actor } from '../common/actor';
import { DashboardQueryDto } from './dto/dashboard-query.dto';
import { DAY_MS, bucketKey, bucketKeys, resolvePeriod, startOfDay } from './dashboard-period';
import { Status, kpi, pct, num, periodInfo, resolveSite } from './dashboard-common';

const ACTIONS: Array<{ key: string; label: string; endpoint: string; roles: string[] }> = [
  { key: 'declare_incident', label: 'Déclarer un incident / presque-accident', endpoint: 'POST /hse/incidents', roles: ['SUPER_ADMIN', 'ADMIN_LOGISTIQUE', 'GESTIONNAIRE_HSE', 'AGENT_HSE'] },
  { key: 'corrective_action', label: 'Créer une action corrective', endpoint: 'POST /hse/actions', roles: ['SUPER_ADMIN', 'ADMIN_LOGISTIQUE', 'GESTIONNAIRE_HSE', 'AGENT_HSE'] },
  { key: 'toolbox_talk', label: 'Planifier / tenir une causerie sécurité', endpoint: 'POST /hse/talks', roles: ['SUPER_ADMIN', 'ADMIN_LOGISTIQUE', 'GESTIONNAIRE_HSE', 'AGENT_HSE'] },
  { key: 'inspection', label: 'Enregistrer une inspection', endpoint: 'POST /hse/inspections', roles: ['SUPER_ADMIN', 'ADMIN_LOGISTIQUE', 'GESTIONNAIRE_HSE', 'AGENT_HSE'] },
  { key: 'ppe', label: 'Remettre un EPI', endpoint: 'POST /hse/ppe', roles: ['SUPER_ADMIN', 'ADMIN_LOGISTIQUE', 'GESTIONNAIRE_HSE', 'AGENT_HSE'] },
  { key: 'training', label: 'Enregistrer une formation / habilitation', endpoint: 'POST /hse/trainings', roles: ['SUPER_ADMIN', 'ADMIN_LOGISTIQUE', 'GESTIONNAIRE_HSE'] },
  { key: 'worked_hours', label: 'Saisir les heures travaillées du mois', endpoint: 'PUT /hse/worked-hours', roles: ['SUPER_ADMIN', 'ADMIN_LOGISTIQUE', 'GESTIONNAIRE_HSE'] },
];
const ALERT_DAYS = 30;

@Injectable()
export class HseDashboardService {
  constructor(private prisma: PrismaService) {}

  async get(actor: Actor, q: DashboardQueryDto) {
    const siteId = resolveSite(actor, q.siteId);
    const p = resolvePeriod(q.period ?? 'month', q.from, q.to, q.granularity);
    const now = new Date();
    const today = startOfDay(now);
    const siteWhere: any = siteId ? { siteId } : {};
    const soon = new Date(+today + ALERT_DAYS * DAY_MS);

    const [incidents, lastLostTime, actions, talks, inspections, ppe, trainings, hours] = await Promise.all([
      this.prisma.hseIncident.findMany({
        where: { ...siteWhere, occurredAt: { gte: p.from, lt: p.to } },
        select: { id: true, reference: true, occurredAt: true, type: true, severity: true, lostTime: true, lostDays: true, status: true, riskCategory: true, zone: true, description: true },
        orderBy: { occurredAt: 'desc' },
      }),
      this.prisma.hseIncident.findFirst({ where: { ...siteWhere, lostTime: true }, orderBy: { occurredAt: 'desc' }, select: { occurredAt: true } }),
      this.prisma.hseCorrectiveAction.findMany({ where: { ...siteWhere, OR: [{ status: { not: 'DONE' } }, { doneAt: { gte: p.from, lt: p.to } }] } }),
      this.prisma.hseToolboxTalk.findMany({ where: { ...siteWhere, plannedAt: { gte: p.from, lt: p.to } }, select: { id: true, theme: true, plannedAt: true, status: true, attendees: { select: { id: true } } } }),
      this.prisma.hseInspection.findMany({ where: { ...siteWhere, inspectedAt: { gte: p.from, lt: p.to } }, select: { id: true, type: true, compliant: true, score: true, inspectedAt: true } }),
      this.prisma.ppeIssuance.findMany({ where: siteWhere, select: { id: true, ppeType: true, compliant: true, renewalDue: true } }),
      this.prisma.hseTraining.findMany({ where: { expiresAt: { not: null, lt: soon } }, select: { id: true, title: true, expiresAt: true, user: { select: { firstName: true, lastName: true } }, driver: { select: { firstName: true, lastName: true } } } }),
      this.prisma.hseWorkedHours.findMany({ where: { ...siteWhere, period: { gte: new Date(Date.UTC(p.from.getUTCFullYear(), p.from.getUTCMonth(), 1)), lt: p.to } } }),
    ]);

    const workedHours = hours.reduce((a, h) => a + num(h.hours), 0);
    const lostTimeAcc = incidents.filter((i) => i.lostTime);
    const lostDays = lostTimeAcc.reduce((a, i) => a + i.lostDays, 0);
    const tf = workedHours > 0 ? Math.round((lostTimeAcc.length * 1_000_000 / workedHours) * 10) / 10 : null; // taux de fréquence
    const tg = workedHours > 0 ? Math.round((lostDays * 1000 / workedHours) * 100) / 100 : null; // taux de gravité
    const nearMiss = incidents.filter((i) => i.type === 'NEAR_MISS').length;
    const daysWithout = lastLostTime ? Math.floor((+today - +startOfDay(lastLostTime.occurredAt)) / DAY_MS) : null;

    const openActions = actions.filter((a) => a.status !== 'DONE');
    const overdueActions = openActions.filter((a) => +a.dueDate < +today);
    const doneInPeriod = actions.filter((a) => a.status === 'DONE').length;
    const closureRate = pct(doneInPeriod, doneInPeriod + openActions.length);

    const talksDone = talks.filter((t) => t.status === 'DONE').length;
    const talkRate = pct(talksDone, talks.filter((t) => t.status !== 'CANCELLED').length);
    const checked = inspections.filter((i) => i.compliant !== null);
    const inspectionRate = pct(checked.filter((i) => i.compliant).length, checked.length);
    const ppeRate = pct(ppe.filter((x) => x.compliant && (!x.renewalDue || +x.renewalDue >= +today)).length, ppe.length);
    const trainingsDue = trainings.map((t) => ({ trainingId: t.id, title: t.title, person: t.user ? `${t.user.firstName} ${t.user.lastName}` : t.driver ? `${t.driver.firstName} ${t.driver.lastName}` : '—', expiresAt: t.expiresAt, daysLeft: Math.floor((+startOfDay(t.expiresAt as Date) - +today) / DAY_MS) })).sort((a, b) => a.daysLeft - b.daysLeft);

    const keys = bucketKeys(p.from, p.to, p.granularity);
    const trend = new Map<string, { incidents: number; nearMiss: number; lostTime: number }>();
    for (const i of incidents) {
      const k = bucketKey(i.occurredAt, p.granularity);
      const b = trend.get(k) ?? { incidents: 0, nearMiss: 0, lostTime: 0 };
      b.incidents += 1; if (i.type === 'NEAR_MISS') b.nearMiss += 1; if (i.lostTime) b.lostTime += 1;
      trend.set(k, b);
    }
    const count = (arr: string[]) => Object.entries(arr.reduce<Record<string, number>>((m, k) => ((m[k] = (m[k] ?? 0) + 1), m), {})).map(([key, n]) => ({ key, count: n }));

    const critical = incidents.some((i) => i.severity === 'CRITICAL' && i.status !== 'CLOSED');
    const accStatus: Status = critical || lostTimeAcc.length > 0 ? 'critical' : incidents.length ? 'warning' : 'ok';

    return {
      generatedAt: now.toISOString(),
      access: { role: actor.role, scope: 'full', siteId: siteId ?? null },
      period: periodInfo(p),
      kpis: [
        kpi('days_without_lti', 'Jours sans accident avec arrêt', 'jours', daysWithout, null, 'up', daysWithout !== null && daysWithout < 30 ? 'warning' : 'ok'),
        kpi('incidents', 'Incidents déclarés', 'incidents', incidents.length, null, 'down', accStatus, { nearMiss }),
        kpi('frequency_rate', 'Taux de fréquence (TF)', 'TF', tf, null, 'down', tf !== null && tf > 0 ? 'warning' : 'ok', { lostTimeAccidents: lostTimeAcc.length, workedHours }),
        kpi('severity_rate', 'Taux de gravité (TG)', 'TG', tg, null, 'down', 'ok', { lostDays }),
        kpi('open_actions', 'Actions correctives ouvertes', 'actions', openActions.length, null, 'down', overdueActions.length ? 'critical' : 'ok', { overdue: overdueActions.length }),
        kpi('action_closure', 'Taux de clôture des actions', '%', closureRate, null, 'up', closureRate !== null && closureRate < 70 ? 'warning' : 'ok'),
        kpi('talks', 'Causeries sécurité tenues', '%', talkRate, null, 'up', talkRate !== null && talkRate < 80 ? 'warning' : 'ok', { held: talksDone, planned: talks.length }),
        kpi('inspections', 'Conformité des inspections', '%', inspectionRate, null, 'up', inspectionRate !== null && inspectionRate < 85 ? 'warning' : 'ok', { inspections: inspections.length }),
        kpi('ppe', 'Conformité EPI', '%', ppeRate, null, 'up', ppeRate !== null && ppeRate < 90 ? 'warning' : 'ok'),
        kpi('trainings_due', 'Formations expirées / à renouveler', 'formations', trainingsDue.length, null, 'down', trainingsDue.some((t) => t.daysLeft < 0) ? 'critical' : trainingsDue.length ? 'warning' : 'ok'),
      ],
      actions: ACTIONS.map((a) => ({ ...a, available: true, allowed: a.roles.includes(actor.role) })),
      worklists: {
        openIncidents: incidents.filter((i) => i.status !== 'CLOSED').slice(0, 20).map((i) => ({ incidentId: i.id, reference: i.reference, date: i.occurredAt, type: i.type, severity: i.severity, status: i.status, description: i.description.slice(0, 120) })),
        overdueActions: overdueActions.slice(0, 20).map((a) => ({ actionId: a.id, title: a.title, dueDate: a.dueDate, daysLate: Math.floor((+today - +startOfDay(a.dueDate)) / DAY_MS) })),
        upcomingTalks: talks.filter((t) => t.status === 'PLANNED').slice(0, 10).map((t) => ({ talkId: t.id, theme: t.theme, plannedAt: t.plannedAt })),
        trainingsDue: trainingsDue.slice(0, 20),
      },
      charts: {
        incidentsTrend: keys.map((k) => ({ period: k, incidents: trend.get(k)?.incidents ?? 0, nearMiss: trend.get(k)?.nearMiss ?? 0, lostTime: trend.get(k)?.lostTime ?? 0 })),
        incidentsByType: count(incidents.map((i) => i.type)),
        incidentsBySeverity: count(incidents.map((i) => i.severity)),
        incidentsByRisk: count(incidents.map((i) => i.riskCategory ?? 'NON_RENSEIGNE')),
        actionsByStatus: [{ key: 'DONE', count: doneInPeriod }, { key: 'OPEN', count: openActions.length - overdueActions.length }, { key: 'OVERDUE', count: overdueActions.length }],
      },
    };
  }
}
