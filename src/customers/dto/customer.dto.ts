import { IsBoolean, IsEmail, IsIn, IsNumber, IsOptional, IsString } from 'class-validator';

export class CreateCustomerDto {
  @IsString() siteId: string;
  @IsString() name: string;
  @IsOptional() @IsString() contactName?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsString() taxNumber?: string;
  @IsOptional() @IsNumber() creditLimit?: number;
  @IsOptional() @IsString() observations?: string;
  @IsOptional() @IsIn(['CLIENT', 'PROSPECT']) kind?: 'CLIENT' | 'PROSPECT';
  // Créer malgré un doublon probable (après vérification par l'utilisateur)
  @IsOptional() @IsBoolean() force?: boolean;
}

export class UpdateCustomerDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() contactName?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsString() taxNumber?: string;
  @IsOptional() @IsNumber() creditLimit?: number;
  @IsOptional() @IsString() observations?: string;
  @IsOptional() @IsIn(['CLIENT', 'PROSPECT']) kind?: 'CLIENT' | 'PROSPECT';
  @IsOptional() @IsBoolean() force?: boolean;
}
