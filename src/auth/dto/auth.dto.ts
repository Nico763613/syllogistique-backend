import { IsIn, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SetPhotoDto {
  // data URL JPEG/PNG/WebP déjà réduite et compressée par l'appareil ; null = supprimer la photo
  @IsOptional()
  @IsString()
  @MaxLength(90000)
  @Matches(/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/, { message: 'Image invalide.' })
  photo?: string | null;
}

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

  // Identité de l'appareil (limite d'appareils par utilisateur)
  @IsOptional() @IsString() @MaxLength(64) deviceFp?: string;
  @IsOptional() @IsIn(['MOBILE', 'DESKTOP']) deviceKind?: string;
  @IsOptional() @IsString() @MaxLength(120) deviceName?: string;
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
  @MinLength(8, { message: 'Le mot de passe doit contenir au moins 8 caractères.' })
  @Matches(/^(?=.*[A-Za-z])(?=.*\d).+$/, { message: 'Le mot de passe doit contenir au moins une lettre et un chiffre.' })
  newPassword: string;
}

export class PasswordResetRequestDto {
  @ApiProperty({ description: 'E-mail ou numéro de téléphone du compte' })
  @IsString()
  @MinLength(5)
  @MaxLength(160)
  identifier: string;
}

export class PasswordResetConfirmDto {
  @ApiProperty()
  @IsString()
  @MinLength(5)
  @MaxLength(160)
  identifier: string;

  @ApiProperty({ description: 'Code à 6 chiffres' })
  @IsString()
  @Matches(/^\s*\d{3}\s?\d{3}\s*$/, { message: 'Le code comporte 6 chiffres.' })
  code: string;

  @ApiProperty()
  @IsString()
  @MinLength(8, { message: 'Le mot de passe doit contenir au moins 8 caractères.' })
  @MaxLength(128)
  @Matches(/^(?=.*[A-Za-z])(?=.*\d).+$/, { message: 'Le mot de passe doit contenir au moins une lettre et un chiffre.' })
  newPassword: string;
}
