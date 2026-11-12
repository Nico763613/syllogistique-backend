import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RoleName } from '@prisma/client';
import { IsEmail } from 'class-validator';
import { Throttle } from '@nestjs/throttler';
import { MessagingService } from './messaging.service';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';

class TestMailDto {
  @IsEmail() to: string;
}

@ApiTags('messaging')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Controller('messaging')
export class MessagingController {
  constructor(private service: MessagingService) {}

  // Envoie un e-mail de test et explique clairement le résultat (réservé au Super Admin, 3 appels/minute)
  @Post('test')
  @Roles(RoleName.SUPER_ADMIN)
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  test(@Body() dto: TestMailDto) {
    return this.service.sendTest(dto.to);
  }
}
