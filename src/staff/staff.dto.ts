import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

// Personnel de terrain : envoie un rapport d'activité chaque jour
export const STAFF_ROLES = ['AGENT_HSE', 'GESTIONNAIRE_HSE', 'MAGASINIER', 'MECANICIEN', 'POINTEUR'] as const;
// Responsables : enregistrés uniquement par le Master Admin (SUPER_ADMIN)
export const MANAGER_ROLES = ['DIRECTEUR_GENERAL', 'ADMIN_LOGISTIQUE'] as const;
export const ALL_STAFF_ROLES = [...STAFF_ROLES, ...MANAGER_ROLES] as const;

export class CreateStaffDto {
  @IsString() @MinLength(1) firstName: string;
  @IsString() @MinLength(1) lastName: string;
  @IsString() @MinLength(8) phone: string;
  @IsIn(ALL_STAFF_ROLES as unknown as string[]) role: string;
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
