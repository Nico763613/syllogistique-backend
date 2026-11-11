// Logique pure de la licence (sans NestJS) : vérification de la signature et calcul de l'état.
import { createPublicKey, verify } from 'crypto';

export const WARN_DAYS = 3; // avertissement après 3 jours sans contact avec le Master
export const GRACE_DAYS = 7; // blocage après 7 jours
const DAY = 86400000;

export type LicState = 'DISABLED' | 'UNACTIVATED' | 'ACTIVE' | 'WARNING' | 'BLOCKED';
export interface LicData {
  instanceId?: string;
  licenseId?: number;
  instanceKey?: string;
  token?: string;
  publicKey?: string;
  lastOkAt?: number;
  invalid?: boolean;
}
export interface LicView { state: LicState; reason?: string; daysLeft?: number; message?: string }

export function verifyToken(token: string, publicPem: string): any | null {
  try {
    const [body, sig] = String(token).split('.');
    if (!body || !sig) return null;
    const ok = verify(null, Buffer.from(body), createPublicKey(publicPem), Buffer.from(sig, 'base64url'));
    return ok ? JSON.parse(Buffer.from(body, 'base64url').toString()) : null;
  } catch {
    return null;
  }
}

export function computeState(enforced: boolean, d: LicData, now = Date.now()): LicView {
  if (!enforced) return { state: 'DISABLED' };
  if (!d.licenseId || !d.token || !d.publicKey) return { state: 'UNACTIVATED', message: "Cette installation n'est pas encore activée." };
  const block = (reason: string, message: string): LicView => ({ state: 'BLOCKED', reason, message });
  if (d.invalid) return block('INVALID', "Licence non reconnue. Contactez votre fournisseur.");
  const p = verifyToken(d.token, d.publicKey);
  if (!p || p.iid !== d.instanceId) return block('TOKEN', 'Licence invalide. Contactez votre fournisseur.');
  if (p.status === 'SUSPENDED') return block('SUSPENDED', 'Licence suspendue. Contactez votre fournisseur.');
  if (p.status === 'REVOKED') return block('REVOKED', 'Licence révoquée. Contactez votre fournisseur.');
  if (p.status === 'EXPIRED') return block('EXPIRED', 'Licence expirée. Contactez votre fournisseur pour la renouveler.');
  if (p.status !== 'ACTIVE') return block('STATUS', 'Licence inactive. Contactez votre fournisseur.');
  const off = (now - (d.lastOkAt || 0)) / DAY;
  if (off >= GRACE_DAYS) return block('OFFLINE', "Aucune vérification de la licence depuis plus de 7 jours. Rétablissez la connexion internet du serveur.");
  if (off >= WARN_DAYS) {
    const daysLeft = Math.max(1, Math.ceil(GRACE_DAYS - off));
    return { state: 'WARNING', daysLeft, message: `La licence n'a pas pu être vérifiée depuis ${Math.floor(off)} jours. Rétablissez la connexion : l'application sera bloquée dans ${daysLeft} jour(s).` };
  }
  return { state: 'ACTIVE' };
}
