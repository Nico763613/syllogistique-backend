import { Module } from '@nestjs/common';
import { BrandingController } from './branding.controller';
import { LicenseModule } from '../license/license.module';

@Module({ imports: [LicenseModule], controllers: [BrandingController] })
export class BrandingModule {}
