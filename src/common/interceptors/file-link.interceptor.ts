import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable, map } from 'rxjs';
import { signDeep, unsignDeep } from '../../uploads/file-links';

// Ajoute un lien signé et temporaire à chaque adresse de fichier (/uploads/…) renvoyée par l'API.
// À l'entrée, retire les signatures des adresses reçues : la base garde toujours l'adresse nue.
// Voir src/uploads/file-links.ts.
@Injectable()
export class FileLinkInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    if (context.getType() !== 'http') return next.handle();
    const req = context.switchToHttp().getRequest();
    if (req?.body && typeof req.body === 'object') req.body = unsignDeep(req.body);
    return next.handle().pipe(map((data) => {
      if (data == null || Buffer.isBuffer(data) || typeof (data as any)?.pipe === 'function' || typeof (data as any)?.getStream === 'function') return data;
      return signDeep(data);
    }));
  }
}
