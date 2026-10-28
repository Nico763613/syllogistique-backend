import { IsEmail, IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { RoleName, UserStatus } from '@prisma/client';

export class CreateUserDto {
  @IsString() firstName: string;
  @IsString() lastName: string;
  @IsEmail() email: string;
  @IsOptional() @IsString() phone?: string;
  @IsString() @MinLength(6) password: string;
  @IsEnum(RoleName) role: RoleName;
  @IsOptional() @IsString() siteId?: string;
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
}
