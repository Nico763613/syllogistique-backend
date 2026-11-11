import { Body, Controller, Get, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { IsString, MaxLength, MinLength } from 'class-validator';
import { Public } from '../common/decorators/public.decorator';
import { LicenseService } from './license.service';

class ActivateDto {
  @IsString() @MinLength(10) @MaxLength(60) code!: string;
}

@Controller('license')
export class LicenseController {
  constructor(private lic: LicenseService) {}

  @Public()
  @Get('status')
  async status() {
    const s = await this.lic.state();
    return { enforced: this.lic.enforced, state: s.state, reason: s.reason ?? null, daysLeft: s.daysLeft ?? null, message: s.message ?? null };
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post('activate')
  async activate(@Body() dto: ActivateDto) {
    const s = await this.lic.activate(dto.code);
    return { state: s.state };
  }
}
