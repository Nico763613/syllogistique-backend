import { createHmac, timingSafeEqual } from 'crypto';
import { readFile } from 'fs/promises';
import { basename, join } from 'path';

// ============================================================================================
// Liens signés des fichiers (photos, reçus, factures, logos).
//
// Un fichier n'est plus lisible par sa seule adresse : le lien porte une date d'expiration et une
// signature (/uploads/<nom>?e=<expiration>&t=<signature>). Le serveur ajoute cette signature à chaque
// adresse de fichier qu'il renvoie dans ses réponses (FileLinkInterceptor). Comme ces réponses sont déjà
// limitées à l'entreprise et au site de l'utilisateur, on ne reçoit de lien valable que pour les fichiers
// qu'on a le droit de voir. Un lien recopié ou transféré cesse de fonctionner après 24 à 25 heures.
// ============================================================================================

const NAME = '[0-9a-f-]{36}\\.(?:jpg|jpeg|png|webp|pdf|heic)';
export const FILE_NAME_RE = new RegExp(`^${NAME}$`);
// Adresse de fichier dans un texte (avec ou sans ancienne signature, qui est remplacée).
const LINK_RE = new RegExp(`/uploads/(${NAME})(?:\\?[A-Za-z0-9=&._~%-]*)?`, 'g');
const VALIDITY_S = 24 * 3600;

function key(): string {
  const k = process.env.FILES_SIGNING_KEY || process.env.JWT_ACCESS_SECRET;
  if (!k) throw new Error('Clé de signature des fichiers absente (FILES_SIGNING_KEY ou JWT_ACCESS_SECRET).');
  return k;
}

function signature(name: string, exp: number): string {
  return createHmac('sha256', key()).update(`${name}:${exp}`).digest('base64url').slice(0, 32);
}

/** Expiration arrondie à l'heure : un même fichier garde le même lien pendant une heure (cache du téléphone). */
function expiry(now = Date.now()): number {
  return Math.ceil(now / 3600_000) * 3600 + VALIDITY_S;
}

export function signedPath(name: string, now = Date.now()): string {
  const e = expiry(now);
  return `/uploads/${name}?e=${e}&t=${signature(name, e)}`;
}

export function verifyLink(name: string, e: unknown, t: unknown, now = Date.now()): boolean {
  const exp = Number(e);
  if (!FILE_NAME_RE.test(name) || !Number.isInteger(exp) || typeof t !== 'string' || t.length !== 32) return false;
  if (exp * 1000 < now || exp * 1000 > now + (VALIDITY_S + 7200) * 1000) return false;
  const a = Buffer.from(signature(name, exp)), b = Buffer.from(t);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Remplace, dans un texte, chaque adresse de fichier par un lien signé. */
export function signText(s: string, now = Date.now()): string {
  return s.includes('/uploads/') ? s.replace(LINK_RE, (_m, name: string) => signedPath(name, now)) : s;
}

/** Parcourt une réponse JSON (objets simples et tableaux) et signe les adresses de fichiers. */
export function signDeep(v: any, now = Date.now(), depth = 0): any {
  if (depth > 40 || v == null) return v;
  if (typeof v === 'string') return signText(v, now);
  if (Array.isArray(v)) return v.map((x) => signDeep(x, now, depth + 1));
  if (typeof v === 'object') {
    const proto = Object.getPrototypeOf(v);
    if (proto !== Object.prototype && proto !== null) return v; // Date, Decimal, Buffer, flux… inchangés
    const out: any = {};
    for (const k of Object.keys(v)) out[k] = signDeep(v[k], now, depth + 1);
    return out;
  }
  return v;
}

/** Nom du fichier contenu dans une adresse /uploads/… (sans la signature), ou null. */
export function uploadName(url?: string | null): string | null {
  if (!url || !url.includes('/uploads/')) return null;
  const n = basename(url.split('?')[0].split('#')[0]);
  return FILE_NAME_RE.test(n) ? n : /^[\w.-]+$/.test(n) ? n : null;
}

/** Contenu d'un fichier envoyé : base de données d'abord (fichiers actuels), puis disque (anciens fichiers). */
export async function readUpload(prisma: any, url?: string | null): Promise<Buffer | null> {
  const name = uploadName(url);
  if (!name) return null;
  try {
    const rows = (await prisma.$queryRawUnsafe('SELECT "data" FROM "uploaded_files" WHERE "name" = $1', name)) as any[];
    if (rows.length) return Buffer.from(rows[0].data);
  } catch { /* table absente : disque */ }
  try { return await readFile(join(__dirname, '..', '..', 'uploads', name)); } catch { return null; }
}

/** Retire les signatures des adresses de fichiers reçues (on enregistre toujours l'adresse nue /uploads/<nom>). */
export function unsignText(s: string): string {
  return s.includes('/uploads/') ? s.replace(LINK_RE, (_m, name: string) => `/uploads/${name}`) : s;
}

export function unsignDeep(v: any, depth = 0): any {
  if (depth > 40 || v == null) return v;
  if (typeof v === 'string') return unsignText(v);
  if (Array.isArray(v)) return v.map((x) => unsignDeep(x, depth + 1));
  if (typeof v === 'object') {
    const proto = Object.getPrototypeOf(v);
    if (proto !== Object.prototype && proto !== null) return v;
    for (const k of Object.keys(v)) v[k] = unsignDeep(v[k], depth + 1);
    return v;
  }
  return v;
}
