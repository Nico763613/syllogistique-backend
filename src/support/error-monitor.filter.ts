import { ArgumentsHost, Catch, HttpException, HttpStatus } from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import { PrismaService } from '../prisma.service';

// Surveillance automatique : toute erreur serveur (5xx) est enregistrée comme signalement « SYSTEM »
// (remontée ensuite au Master). Limite : une erreur identique toutes les 10 minutes. Le comportement HTTP ne change pas.
@Catch()
export class ErrorMonitorFilter extends BaseExceptionFilter {
  private seen = new Map<string, number>();
  constructor(private prisma: PrismaService) { super(); }

  catch(exception: unknown, host: ArgumentsHost) {
    try {
      const status = exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
      if (status >= 500) {
        const req = host.switchToHttp().getRequest();
        const route = `${req?.method ?? ''} ${String(req?.route?.path ?? req?.path ?? '').slice(0, 100)}`.trim();
        const msg = String((exception as any)?.message ?? exception).slice(0, 300);
        const key = route + '|' + msg;
        if (Date.now() - (this.seen.get(key) ?? 0) > 600000) {
          this.seen.set(key, Date.now());
          if (this.seen.size > 500) this.seen.clear();
          void this.prisma.problemReport
            .create({ data: { userId: req?.user?.userId ?? 'system', userName: 'Serveur', role: 'SYSTEM', screen: route, lastError: msg, message: 'Erreur serveur détectée automatiquement', status: 'NEW' } })
            .catch(() => undefined);
        }
      }
    } catch { /* la surveillance ne doit jamais casser une réponse */ }
    super.catch(exception, host);
  }
}
