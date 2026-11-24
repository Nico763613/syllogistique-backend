import { Controller, Post, Get, Param, Res, UploadedFile, UseInterceptors, UseGuards, BadRequestException, NotFoundException, Query } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { extname } from 'path';
import { v4 as uuid } from 'uuid';
import { ApiTags, ApiBearerAuth, ApiConsumes } from '@nestjs/swagger';
import { RoleName } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { Public } from '../common/decorators/public.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { PrismaService } from '../prisma.service';

const MIME: Record<string, string> = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.pdf': 'application/pdf', '.heic': 'image/heic' };
const MAX_SIZE = 15 * 1024 * 1024; // 15 Mo

// Les fichiers sont conservés dans la base de données (table uploaded_files) : le disque de l'hébergeur
// est effacé à chaque mise en ligne, ce qui ferait disparaître reçus de carburant, photos de panne et logos.
// Les anciens fichiers encore présents sur le disque restent servis par main.ts.
@ApiTags('uploads')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Controller('uploads')
export class UploadsController {
  constructor(private prisma: PrismaService) {}

  @Post()
  @Roles(RoleName.SUPER_ADMIN, RoleName.ADMIN_LOGISTIQUE, RoleName.GESTIONNAIRE_FLOTTE, RoleName.MAGASINIER, RoleName.CHAUFFEUR, RoleName.MECANICIEN)
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: MAX_SIZE } }))
  async upload(@UploadedFile() file: Express.Multer.File, @Query('category') category?: string) {
    if (!file) throw new BadRequestException('Aucun fichier reçu.');
    const ext = extname(file.originalname).toLowerCase();
    if (!MIME[ext]) throw new BadRequestException(`Extension non autorisée : ${ext}`);
    // Le contenu doit correspondre à l'extension (un script renommé en .jpg est refusé)
    const b = file.buffer;
    const ok =
      (['.jpg', '.jpeg'].includes(ext) && b[0] === 0xff && b[1] === 0xd8) ||
      (ext === '.png' && b.slice(0, 4).toString('hex') === '89504e47') ||
      (ext === '.pdf' && b.slice(0, 4).toString() === '%PDF') ||
      (ext === '.webp' && b.slice(0, 4).toString() === 'RIFF' && b.slice(8, 12).toString() === 'WEBP') ||
      (ext === '.heic' && b.slice(4, 8).toString() === 'ftyp');
    if (!ok) throw new BadRequestException("Le contenu du fichier ne correspond pas à son type (JPG, PNG, WEBP, PDF ou HEIC attendus).");
    const name = `${uuid()}${ext}`;
    await this.prisma.$executeRaw`INSERT INTO uploaded_files (name, mime, size, data) VALUES (${name}, ${MIME[ext]}, ${file.size}, ${file.buffer})`;
    return {
      url: `/uploads/${name}`,
      originalName: file.originalname,
      size: file.size,
      category: category || 'other', // vehicle_photo, fuel_receipt, maintenance_invoice, driver_license, document, signature
    };
  }

  // Lecture publique (balises <img>) : les noms sont des UUID non devinables
  @Public()
  @Get(':name')
  async read(@Param('name') name: string, @Res() res: any) {
    if (!/^[0-9a-f-]{36}\.(jpg|jpeg|png|webp|pdf|heic)$/.test(name)) throw new NotFoundException();
    const rows = await this.prisma.$queryRaw<{ mime: string; data: Buffer }[]>`SELECT mime, data FROM uploaded_files WHERE name = ${name}`;
    if (!rows.length) throw new NotFoundException();
    res.setHeader('Content-Type', rows[0].mime);
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'");
    res.send(Buffer.from(rows[0].data));
  }
}
