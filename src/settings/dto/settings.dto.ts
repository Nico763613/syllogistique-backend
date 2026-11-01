import { IsEmail, IsOptional, IsString, MaxLength } from 'class-validator';

export class SetSettingDto {
  @IsString() @MaxLength(200) value: string;
  // Motif de la modification (obligatoire pour le tarif carburant)
  @IsOptional() @IsString() @MaxLength(300) reason?: string;
}

export class UpdateOrganizationDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() logoUrl?: string;
  @IsOptional() @IsString() currency?: string;
}
