import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

// Envoi d'email (facture, rapport) via SMTP configuré dans .env.
// Tant que SMTP_HOST n'est pas renseigné, l'envoi est simulé (log uniquement) —
// l'API reste utilisable en développement sans compte email.
@Injectable()
export class MessagingService {
  private readonly logger = new Logger(MessagingService.name);
  private transporter: nodemailer.Transporter | null = null;

  constructor(private config: ConfigService) {
    const host = this.config.get<string>('SMTP_HOST');
    if (host) {
      this.transporter = nodemailer.createTransport({
        host,
        port: Number(this.config.get('SMTP_PORT') || 587),
        secure: this.config.get('SMTP_SECURE') === 'true',
        auth: {
          user: this.config.get('SMTP_USER'),
          pass: this.config.get('SMTP_PASSWORD'),
        },
      });
    }
  }

  async sendEmailWithAttachment(params: {
    to: string;
    subject: string;
    text: string;
    filename: string;
    buffer: Buffer;
    contentType: string;
  }) {
    if (!this.transporter) {
      this.logger.warn(`SMTP non configuré — email simulé vers ${params.to} : "${params.subject}"`);
      return { sent: false, simulated: true };
    }

    await this.transporter.sendMail({
      from: this.config.get('SMTP_FROM') || 'SYLLOGISTIQUE <no-reply@syllogistique.local>',
      to: params.to,
      subject: params.subject,
      text: params.text,
      attachments: [{ filename: params.filename, content: params.buffer, contentType: params.contentType }],
    });
    return { sent: true, simulated: false };
  }

  // WhatsApp : pas d'envoi automatique sans compte WhatsApp Business API (payant/à valider par Meta).
  // On génère un lien wa.me pré-rempli — le client l'ouvre et envoie en un tap,
  // en joignant lui-même le PDF téléchargé au préalable.
  buildWhatsAppLink(phone: string, message: string) {
    const cleanPhone = phone.replace(/[^\d]/g, '');
    return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;
  }
}
