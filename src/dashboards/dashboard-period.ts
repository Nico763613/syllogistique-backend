import { BadRequestException } from '@nestjs/common';

// Fuseau Africa/Conakry = UTC+0 toute l'année (pas d'heure d'été) : les dates UTC sont donc les dates locales.
export type PeriodKey = 'day' | 'week' | 'month' | 'year' | 'custom';
export type Granularity = 'hour' | 'day' | 'week' | 'month' | 'year';

export interface ResolvedPeriod {
  key: PeriodKey;
  from: Date; // inclus
  to: Date; // exclu
  previousFrom: Date;
  previousTo: Date;
  granularity: Granularity;
}

export const DAY_MS = 86_400_000;
const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d));
export const startOfDay = (d: Date) => utc(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());

function parseDay(value: string | undefined, label: string): Date {
  if (!value || !/^\d{4}-\d{2}-\d{2}/.test(value)) {
    throw new BadRequestException(`Paramètre « ${label} » invalide (format AAAA-MM-JJ attendu).`);
  }
  const d = new Date(value.slice(0, 10) + 'T00:00:00.000Z');
  if (isNaN(d.getTime())) throw new BadRequestException(`Paramètre « ${label} » invalide.`);
  return d;
}

export function resolvePeriod(
  key: PeriodKey = 'month',
  fromStr?: string,
  toStr?: string,
  granularity?: Granularity,
  now: Date = new Date(),
): ResolvedPeriod {
  const today = startOfDay(now);
  const y = today.getUTCFullYear();
  const m = today.getUTCMonth();
  let from: Date;
  let to: Date;
  let previousFrom: Date;
  let previousTo: Date;
  let defaultGranularity: Granularity;

  switch (key) {
    case 'day':
      from = today;
      to = new Date(+today + DAY_MS);
      previousFrom = new Date(+today - DAY_MS);
      previousTo = today;
      defaultGranularity = 'hour';
      break;
    case 'week': {
      const dow = (today.getUTCDay() + 6) % 7; // lundi = 0
      from = new Date(+today - dow * DAY_MS);
      to = new Date(+from + 7 * DAY_MS);
      previousFrom = new Date(+from - 7 * DAY_MS);
      previousTo = from;
      defaultGranularity = 'day';
      break;
    }
    case 'month':
      from = utc(y, m, 1);
      to = utc(y, m + 1, 1);
      previousFrom = utc(y, m - 1, 1);
      previousTo = from;
      defaultGranularity = 'day';
      break;
    case 'year':
      from = utc(y, 0, 1);
      to = utc(y + 1, 0, 1);
      previousFrom = utc(y - 1, 0, 1);
      previousTo = from;
      defaultGranularity = 'month';
      break;
    case 'custom': {
      const f = parseDay(fromStr, 'from');
      const t = parseDay(toStr, 'to');
      if (+t < +f) throw new BadRequestException('La date de fin précède la date de début.');
      const days = Math.round((+t - +f) / DAY_MS) + 1;
      if (days > 731) throw new BadRequestException('Période personnalisée limitée à 2 ans.');
      from = f;
      to = new Date(+t + DAY_MS);
      previousTo = f;
      previousFrom = new Date(+f - days * DAY_MS);
      defaultGranularity = days <= 62 ? 'day' : 'month';
      break;
    }
    default:
      throw new BadRequestException('Période inconnue.');
  }
  return { key, from, to, previousFrom, previousTo, granularity: granularity ?? defaultGranularity };
}

export function bucketKey(d: Date, g: Granularity): string {
  const iso = d.toISOString();
  switch (g) {
    case 'hour':
      return iso.slice(0, 13) + ':00';
    case 'day':
      return iso.slice(0, 10);
    case 'week': {
      const s = startOfDay(d);
      const dow = (s.getUTCDay() + 6) % 7;
      return new Date(+s - dow * DAY_MS).toISOString().slice(0, 10);
    }
    case 'month':
      return iso.slice(0, 7);
    default:
      return iso.slice(0, 4);
  }
}

function nextBucket(d: Date, g: Granularity): Date {
  switch (g) {
    case 'hour':
      return new Date(+d + 3_600_000);
    case 'day':
      return new Date(+d + DAY_MS);
    case 'week':
      return new Date(+d + 7 * DAY_MS);
    case 'month':
      return utc(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
    default:
      return utc(d.getUTCFullYear() + 1, 0, 1);
  }
}

// Liste continue des pas de la période (les pas sans donnée valent 0 dans les graphiques)
export function bucketKeys(from: Date, to: Date, g: Granularity): string[] {
  const keys: string[] = [];
  const seen = new Set<string>();
  let cur = new Date(from);
  for (let i = 0; i < 2000 && +cur < +to; i++) {
    const k = bucketKey(cur, g);
    if (!seen.has(k)) {
      seen.add(k);
      keys.push(k);
    }
    cur = nextBucket(cur, g);
  }
  return keys;
}

// Variation en % par rapport à la période précédente (null si la période précédente vaut 0)
export function variation(current: number, previous: number): number | null {
  if (!previous) return null;
  return Math.round(((current - previous) / Math.abs(previous)) * 1000) / 10;
}
