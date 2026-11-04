import { ForbiddenException } from '@nestjs/common';
import { Actor } from '../common/actor';

export type Status = 'ok' | 'warning' | 'critical';

export const num = (v: unknown): number => (v === null || v === undefined ? 0 : Number(v));
export const gnf = (v: number): number => Math.round(v); // montants en GNF entiers
export const pct = (a: number, b: number): number | null => (b ? Math.round((a / b) * 1000) / 10 : null);

// Site effectif : le Super Admin voit tout ou le site demandé ; les autres restent sur leur site.
export function resolveSite(actor: Actor, requested?: string): string | undefined {
  if (actor.role === 'SUPER_ADMIN') return requested || undefined;
  if (actor.siteId) {
    if (requested && requested !== actor.siteId) throw new ForbiddenException("Ce site n'est pas dans votre périmètre.");
    return actor.siteId;
  }
  return requested || undefined;
}

export const periodInfo = (p: { key: string; from: Date; to: Date; granularity: string; previousFrom: Date; previousTo: Date }) => ({
  key: p.key, from: p.from.toISOString(), to: new Date(+p.to - 1).toISOString(), granularity: p.granularity,
  previousFrom: p.previousFrom.toISOString(), previousTo: new Date(+p.previousTo - 1).toISOString(),
});

// Carte KPI standard (valeur, période précédente, variation, sens favorable, statut vs seuil)
export function kpi(
  key: string, label: string, unit: string, value: number | null, previous: number | null,
  favorable: 'up' | 'down' | 'neutral', status: Status = 'ok', extra: Record<string, unknown> = {},
) {
  return {
    key, label, unit, value, previous,
    variationPercent: value === null || previous === null || !previous ? null : Math.round(((value - previous) / Math.abs(previous)) * 1000) / 10,
    favorable, status, ...extra,
  };
}
