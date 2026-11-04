import { IsDateString, IsIn, IsOptional, IsString } from 'class-validator';

export const PERIODS = ['day', 'week', 'month', 'year', 'custom'] as const;
export const GRANULARITIES = ['hour', 'day', 'week', 'month', 'year'] as const;

export class DashboardQueryDto {
  // Site (vide = tous les sites autorisés à l'utilisateur)
  @IsOptional() @IsString() siteId?: string;
  // Période : jour / semaine / mois / année / personnalisée (défaut : mois, ou jour pour un caissier)
  @IsOptional() @IsIn(PERIODS as unknown as string[]) period?: (typeof PERIODS)[number];
  // Pour period=custom : bornes incluses au format AAAA-MM-JJ
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
  // Pas des graphiques (par défaut selon la période)
  @IsOptional() @IsIn(GRANULARITIES as unknown as string[]) granularity?: (typeof GRANULARITIES)[number];
}
