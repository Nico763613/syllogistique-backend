import { Body, Controller, Delete, Get, Post, Put, Req, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Request } from 'express';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { LoginDto, RefreshTokenDto, ChangePasswordDto, SetPhotoDto, PasswordResetConfirmDto, PasswordResetRequestDto } from './dto/auth.dto';
import { PasswordResetService } from './password-reset.service';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService, private passwordReset: PasswordResetService) {}

  // Mot de passe oublié : réponse identique que le compte existe ou non (aucune information divulguée).
  @Public()
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  @Post('password-reset/request')
  passwordResetRequest(@Body() dto: PasswordResetRequestDto, @Req() req: Request) {
    return this.passwordReset.request(dto.identifier, req.ip);
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post('password-reset/confirm')
  passwordResetConfirm(@Body() dto: PasswordResetConfirmDto, @Req() req: Request) {
    return this.passwordReset.confirm(dto.identifier, dto.code, dto.newPassword, req.ip);
  }

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
  @Post('invite/info')
  inviteInfo(@Body() body: { token: string }) {
    return this.authService.inviteInfo(body?.token);
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post('invite/accept')
  acceptInvite(@Body() body: { token: string; password: string }) {
    return this.authService.acceptInvite(body?.token, body?.password);
  }

  @Public()
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @Post('refresh')
  refresh(@Body() dto: RefreshTokenDto) {
    return this.authService.refresh(dto.refreshToken);
  }

  // Photo de profil de l'utilisateur connecté (lecture, ajout/changement, suppression)
  @ApiBearerAuth()
  @Get('photo')
  getPhoto(@CurrentUser() user: any) {
    return this.authService.getPhoto(user.userId);
  }

  @ApiBearerAuth()
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Put('photo')
  setPhoto(@CurrentUser() user: any, @Body() dto: SetPhotoDto) {
    return this.authService.setPhoto(user.userId, dto.photo);
  }

  @ApiBearerAuth()
  @Delete('photo')
  removePhoto(@CurrentUser() user: any) {
    return this.authService.setPhoto(user.userId, null);
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
