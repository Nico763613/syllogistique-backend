import { Module } from '@nestjs/common';
import { QrcodesController } from './qrcodes.controller';

@Module({
  controllers: [QrcodesController],
})
export class QrcodesModule {}
