import { Controller, Get, Param, Query, Res, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Response } from 'express';
import * as QRCode from 'qrcode';
import { RolesGuard } from '../common/guards/roles.guard';

// Génère un QR Code (PNG) encodant l'ID de l'entité, à imprimer et coller sur
// le véhicule ou l'article. Le scan (côté client mobile/web) redirige vers la
// fiche correspondante — ex. VEHICLE:<id> ou ITEM:<id>.
@ApiTags('qrcodes')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Controller('qrcodes')
export class QrcodesController {
  @Get(':type/:id')
  async generate(
    @Param('type') type: 'vehicle' | 'item',
    @Param('id') id: string,
    @Query('size') size: string,
    @Res() res: Response,
  ) {
    const payload = `${type.toUpperCase()}:${id}`;
    const buffer = await QRCode.toBuffer(payload, {
      width: size ? Number(size) : 300,
      margin: 1,
      color: { dark: '#163A5F', light: '#FFFFFF' },
    });
    res.set({ 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=86400' });
    res.send(buffer);
  }
}
