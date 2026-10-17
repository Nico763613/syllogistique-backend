import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Request } from 'express';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { LoginDto, RefreshTokenDto, ChangePasswordDto } from './dto/auth.dto';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  // Anti-force-brute : 5 tentatives de connexion par minute et par adresse IP
  @Public()
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post('login')
  login(@Body() dto: LoginDto, @Req() req: Request) {
    return this.authService.login(dto, {
      deviceId: req.headers['x-device-id'] as string,
      ipAddress: req.ip,
    });
  }

  @Public()
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @Post('refresh')
  refresh(@Body() dto: RefreshTokenDto) {
    return this.authService.refresh(dto.refreshToken);
  }

  @ApiBearerAuth()
  @Post('logout')
  logout(@CurrentUser() user: any) {
    return this.authService.logout(user.userId);
  }

  @ApiBearerAuth()
  @Post('change-password')
  changePassword(@CurrentUser() user: any, @Body() dto: ChangePasswordDto) {
    return this.authService.changePassword(user.userId, dto);
  }
}
