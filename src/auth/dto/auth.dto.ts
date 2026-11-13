import { IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
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
