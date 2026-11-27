// État du compte vérifié à chaque requête (suspension, suppression, changement de mot de passe imposé).
// Petite mémoire de 20 secondes pour ne pas interroger la base à chaque appel ; vidée dès qu'un
// compte change d'état (suspension, nouveau mot de passe…).
export interface AccountState { active: boolean; mustChangePassword: boolean; at: number }
const cache = new Map<string, AccountState>();
export const ACCOUNT_STATE_TTL_MS = 20_000;
export const accountStateCache = {
  get(userId: string): AccountState | undefined {
    const s = cache.get(userId);
    if (s && Date.now() - s.at < ACCOUNT_STATE_TTL_MS) return s;
    cache.delete(userId);
    return undefined;
  },
  set(userId: string, s: Omit<AccountState, 'at'>) { if (cache.size > 5000) cache.clear(); cache.set(userId, { ...s, at: Date.now() }); },
  forget(userId: string) { cache.delete(userId); },
};
