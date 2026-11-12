import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export const STAFF_ROLES = ['AGENT_HSE', 'GESTIONNAIRE_HSE', 'MAGASINIER'] as const;

export class CreateStaffDto {
  @IsString() @MinLength(1) firstName: string;
  @IsString() @MinLength(1) lastName: string;
  @IsString() @MinLength(8) phone: string;
  @IsIn(STAFF_ROLES as unknown as string[]) role: string;
  @IsString() siteId: string;
}

export class InviteStaffDto {
  @IsString() userId: string;
  @IsString() appUrl: string;
}

export class StaffReportDto {
  @IsString() @MinLength(8) date: string;
  @IsString() @MinLength(3) @MaxLength(4000) activities: string;
  @IsOptional() @IsString() @MaxLength(4000) observations?: string;
}
