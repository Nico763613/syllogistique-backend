import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

export type MailResult = {
  sent: boolean;
  simulated: boolean;
  // AUTH | SENDER_REFUSED | TIMEOUT | CONNECTION | CONFIG | UNKNOWN
  error?: string;
  message?: string;
};

const SENDER_NAME = 'Mokonzi Multi-Services';

// Tout l'envoi d'e-mails passe par ce fichier (SMTP via nodemailer).
// Variables : SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, MAIL_FROM
// (anciens noms acceptés : SMTP_PASSWORD, SMTP_FROM). Aucune valeur en dur.
// Passer plus tard à l'API Brevo (HTTPS) ne demande de changer que la méthode deliver().
// Un échec d'envoi ne lève JAMAIS d'exception : il est journalisé et renvoyé dans le résultat.
@Injectable()
export class MessagingService {
  private readonly logger = new Logger(MessagingService.name);
  private transporter: nodemailer.Transporter | null = null;
  private fromAddress = '';
  private missing: string[] = [];

  constructor(private config: ConfigService) {
    const host = this.config.get<string>('SMTP_HOST');
    const user = this.config.get<string>('SMTP_USER');
    const pass = this.config.get<string>('SMTP_PASS') || this.config.get<string>('SMTP_PASSWORD');
    const from = this.config.get<string>('MAIL_FROM') || this.config.get<string>('SMTP_FROM');
    if (!host) return; // envoi simulé (développement)
    if (!user) this.missing.push('SMTP_USER');
    if (!pass) this.missing.push('SMTP_PASS');
    if (!from) this.missing.push('MAIL_FROM');
    if (this.missing.length) {
      this.logger.error(`SMTP incomplet : variable(s) manquante(s) → ${this.missing.join(', ')}. Aucun e-mail ne sera envoyé.`);
      return;
    }
    const m = /<([^>]+)>/.exec(from as string);
    this.fromAddress = (m ? m[1] : (from as string)).trim();
    const port = Number(this.config.get('SMTP_PORT') || 587);
    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465, // 465 = SSL direct ; 587 = STARTTLS imposé ci-dessous
      requireTLS: port !== 465,
      auth: { user, pass },
      connectionTimeout: 8000,
      greetingTimeout: 8000,
      socketTimeout: 15000,
      dnsTimeout: 5000,
    });
  }

  // a***@domaine.com : l'adresse complète n'est jamais écrite dans les logs
  private mask(address: string) {
    return String(address).split(/[,;\s]+/).filter(Boolean).map((a) => {
      const [l, d] = a.split('@');
      return d ? `${l.slice(0, 1)}***@${d}` : '***';
    }).join(', ');
  }

  private classify(err: any): { error: string; message: string } {
    const code = String(err?.code || '');
    const rc = Number(err?.responseCode || 0);
    if (code === 'EAUTH' || rc === 535 || rc === 534) {
      return { error: 'AUTH', message: "Authentification refusée par le serveur d'e-mail : vérifiez SMTP_USER et SMTP_PASS (clé SMTP)." };
    }
    if (['ETIMEDOUT', 'ESOCKETTIMEDOUT'].includes(code) || /timeout|timed out/i.test(String(err?.message || ''))) {
      return { error: 'TIMEOUT', message: "Délai dépassé : le serveur d'e-mail ne répond pas (sur l'offre gratuite de Render, les ports SMTP sont bloqués)." };
    }
    if (['ECONNECTION', 'ECONNREFUSED', 'ENOTFOUND', 'ECONNRESET', 'EDNS', 'ESOCKET'].includes(code)) {
      return { error: 'CONNECTION', message: "Connexion impossible au serveur d'e-mail : vérifiez SMTP_HOST et SMTP_PORT (ou blocage du port par l'hébergeur)." };
    }
    if (code === 'EENVELOPE' || [550, 551, 553, 554].includes(rc)) {
      return { error: 'SENDER_REFUSED', message: "Expéditeur ou destinataire refusé : vérifiez que l'adresse MAIL_FROM est un expéditeur validé chez Brevo." };
    }
    return { error: 'UNKNOWN', message: "Échec d'envoi de l'e-mail (voir les logs du serveur)." };
  }

  private async deliver(mail: { to: string; subject: string; text: string; attachments?: any[] }): Promise<MailResult> {
    if (!this.transporter) {
      if (this.missing.length) {
        return { sent: false, simulated: true, error: 'CONFIG', message: `Configuration e-mail incomplète : ${this.missing.join(', ')} manquant(e).` };
      }
      this.logger.warn(`SMTP non configuré — e-mail simulé vers ${this.mask(mail.to)} : "${mail.subject}"`);
      return { sent: false, simulated: true, error: 'CONFIG', message: 'E-mail non configuré sur le serveur (SMTP).' };
    }
    try {
      await this.transporter.sendMail({
        from: { name: SENDER_NAME, address: this.fromAddress },
        to: mail.to,
        subject: mail.subject,
        text: mail.text,
        attachments: mail.attachments,
      });
      return { sent: true, simulated: false };
    } catch (err: any) {
      const c = this.classify(err);
      this.logger.error(`Envoi e-mail échoué vers ${this.mask(mail.to)} : ${c.error} (${err?.code || ''} ${err?.responseCode || ''})`);
      return { sent: false, simulated: false, error: c.error, message: c.message };
    }
  }

  async sendEmailWithAttachment(params: {
    to: string;
    subject: string;
    text: string;
    filename: string;
    buffer: Buffer;
    contentType: string;
  }): Promise<MailResult> {
    return this.deliver({
      to: params.to,
      subject: params.subject,
      text: params.text,
      attachments: [{ filename: params.filename, content: params.buffer, contentType: params.contentType }],
    });
  }

  // Route de test (administrateur)
  async sendTest(to: string): Promise<MailResult> {
    const r = await this.deliver({
      to,
      subject: 'Test e-mail — SYL LOGISTIQUE',
      text: "Ceci est un e-mail de test envoyé par SYL LOGISTIQUE. Si vous le lisez, l'envoi d'e-mails fonctionne.",
    });
    return r.sent ? { ...r, message: 'E-mail de test envoyé. Vérifiez la boîte de réception (et les spams).' } : r;
  }

  // WhatsApp : pas d'envoi automatique sans compte WhatsApp Business API (payant/à valider par Meta).
  // On génère un lien wa.me pré-rempli — le client l'ouvre et envoie en un tap,
  // en joignant lui-même le PDF téléchargé au préalable.
  buildWhatsAppLink(phone: string, message: string) {
    const cleanPhone = phone.replace(/[^\d]/g, '');
    return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;
  }
}
