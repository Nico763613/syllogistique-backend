import { Controller, Post, UploadedFile, UseInterceptors, UseGuards, BadRequestException, Query } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { v4 as uuid } from 'uuid';
import { ApiTags, ApiBearerAuth, ApiConsumes } from '@nestjs/swagger';
import { RolesGuard } from '../common/guards/roles.guard';

const ALLOWED_EXT = ['.jpg', '.jpeg', '.png', '.webp', '.pdf', '.heic'];
const MAX_SIZE = 15 * 1024 * 1024; // 15 Mo

// Stockage local par défaut (dossier /uploads, servi statiquement par main.ts).
// Pour passer à un stockage S3-compatible en production : remplacer `diskStorage`
// par un `multerS3` storage (AWS SDK) — l'interface de l'endpoint ne change pas,
// seule l'URL retournée devient l'URL du bucket au lieu de /uploads/...
@ApiTags('uploads')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Controller('uploads')
export class UploadsController {
  @Post()
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: './uploads',
        filename: (_req, file, cb) => {
          const ext = extname(file.originalname).toLowerCase();
          if (!ALLOWED_EXT.includes(ext)) {
            return cb(new BadRequestException(`Extension non autorisée : ${ext}`), '');
          }
          cb(null, `${uuid()}${ext}`);
        },
      }),
      limits: { fileSize: MAX_SIZE },
    }),
  )
  upload(@UploadedFile() file: Express.Multer.File, @Query('category') category?: string) {
    if (!file) throw new BadRequestException('Aucun fichier reçu.');
    return {
      url: `/uploads/${file.filename}`,
      originalName: file.originalname,
      size: file.size,
      category: category || 'other', // vehicle_photo, fuel_receipt, maintenance_invoice, driver_license, document, signature
    };
  }
}
