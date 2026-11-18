'use strict';
// Diagnostic automatique (règles) d'un signalement : cause probable + action conseillée, en langage simple.
// Aucun appel externe, aucun contenu privé : on n'analyse que le message, l'écran et le contexte déjà remontés.
const RULES = [
  [/password authentication failed|authentication failed|28P01/i, 'Base de données', 'Le mot de passe de la base a changé ou est faux.', "Mettre à jour DATABASE_URL dans Render (et dans le dépôt de sauvegardes), puis redéployer."],
  [/ECONNREFUSED|ETIMEDOUT|ENOTFOUND|timeout|timed out|Can't reach database|P1001/i, 'Connexion', "Un service (base de données ou serveur) ne répond pas : réveil du serveur gratuit, coupure réseau ou panne.", "Réessayer dans une minute. Si cela se répète, vérifier l'état de Render et de Neon."],
  [/Failed to fetch|NetworkError|Load failed|network|hors ligne|offline/i, 'Réseau', "Le téléphone ou l'ordinateur n'a pas pu joindre le serveur (réseau faible ou hors ligne).", "Vérifier la connexion de l'utilisateur ; l'application resynchronise automatiquement au retour du réseau."],
  [/401|unauthorized|session expir|token/i, 'Session', "La session de l'utilisateur a expiré ou a été révoquée.", "Demander à l'utilisateur de se reconnecter ; vérifier qu'il n'a pas été bloqué."],
  [/403|forbidden|non autoris|permission|droits/i, 'Droits', "L'utilisateur a tenté une action non autorisée pour son rôle.", "Vérifier son rôle ; ne rien changer si l'accès doit rester refusé."],
  [/402|licen[cs]e|licence/i, 'Licence', "La licence est expirée, suspendue ou non vérifiée.", "Ouvrir la licence du client dans le Master (prolonger ou rétablir)."],
  [/appareil|device|QR|activation|code d'activation/i, 'Appareil', "Problème d'activation ou de limite d'appareils.", "Voir Gestion des appareils : annuler/regénérer le QR, libérer ou débloquer l'appareil."],
  [/SMTP|e-?mail|mail|EAUTH|535/i, 'E-mail', "L'envoi d'e-mail est refusé ou non configuré.", "Vérifier SMTP_* et MAIL_FROM chez le client ; sur l'offre gratuite de Render les ports SMTP sont bloqués."],
  [/Cannot read propert|undefined|is not a function|TypeError|ReferenceError/i, 'Bug application', "Erreur d'affichage dans l'application : une donnée attendue est absente.", "Transmettre au développeur avec l'écran et l'heure ; contournement : actualiser la page."],
  [/P2002|unique constraint|duplicate|déjà|existe déjà/i, 'Doublon', "Un enregistrement identique existe déjà.", "Chercher l'élément existant avant de le recréer."],
  [/P2025|not found|introuvable|404/i, 'Introuvable', "L'élément demandé n'existe plus ou a été supprimé.", "Actualiser la liste ; vérifier qu'il n'a pas été archivé."],
  [/5\d\d|internal server|Erreur serveur|SYSTEM/i, 'Serveur', "Erreur interne du serveur du client.", "Consulter les journaux Render du client à l'heure indiquée ; signaler au développeur si elle se répète."],
];
function diagnose(r) {
  const text = [r.message, r.context, r.screen].filter(Boolean).join(' | ');
  if (!text.trim()) return { category: 'Inconnu', cause: 'Aucun détail transmis.', action: "Contacter l'utilisateur pour connaître l'écran et ce qu'il faisait." };
  for (const [re, category, cause, action] of RULES) if (re.test(text)) return { category, cause, action };
  return { category: 'À analyser', cause: "Cause non reconnue automatiquement.", action: "Lire le message et le contexte, puis contacter l'utilisateur si besoin." };
}
module.exports = { diagnose };
