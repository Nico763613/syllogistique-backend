import { IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LoginDto {
  // E-mail, ou numéro de téléphone pour les chauffeurs
  @ApiProperty({ example: 'admin@syllogistique.local' })
  @IsString()
  @MinLength(5)
  email: string;

  @ApiProperty({ example: 'ChangeMoi123!' })
  @IsString()
  @MinLength(6)
  password: string;
}

export class RefreshTokenDto {
  @ApiProperty()
  @IsString()
  refreshToken: string;
}

export class ChangePasswordDto {
  @ApiProperty()
  @IsString()
  @MinLength(6)
  currentPassword: string;

  @ApiProperty()
  @IsString()
  @MinLength(6)
  newPassword: string;
}
