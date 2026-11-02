import { IsEmail, IsEnum, IsIn, IsOptional, IsString, MinLength } from 'class-validator';
import { RoleName, UserStatus } from '@prisma/client';
import { DEPARTMENTS, Department } from '../../common/departments';

export class CreateUserDto {
  @IsString() firstName: string;
  @IsString() lastName: string;
  @IsEmail() email: string;
  @IsOptional() @IsString() phone?: string;
  @IsString() @MinLength(6) password: string;
  @IsEnum(RoleName) role: RoleName;
  @IsOptional() @IsString() siteId?: string;
  @IsOptional() @IsIn(DEPARTMENTS as unknown as string[]) department?: Department | null;
}

export class ResetPasswordDto {
  @IsString() @MinLength(8) newPassword: string;
}

export class UpdateUserDto {
  @IsOptional() @IsString() firstName?: string;
  @IsOptional() @IsString() lastName?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsEnum(RoleName) role?: RoleName;
  @IsOptional() @IsEnum(UserStatus) status?: UserStatus;
  @IsOptional() @IsString() siteId?: string;
  // Département (LOGISTIQUE, CARBURANT, STOCK, RH) ; null = aucune restriction
  @IsOptional() @IsIn(DEPARTMENTS as unknown as string[]) department?: Department | null;
}
