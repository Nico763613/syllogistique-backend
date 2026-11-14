import { IsIn, IsNumber, IsOptional, IsString, Min, MinLength } from 'class-validator';

export const DOWNTIME_CATEGORIES = ['PANNE', 'ACCIDENT', 'ENTRETIEN', 'ADMINISTRATIF', 'AUTRE'];

export class ReportDowntimeDto {
  @IsString() vehicleId: string;
  @IsOptional() @IsIn(DOWNTIME_CATEGORIES) category?: string;
  // Motif obligatoire : la traçabilité de chaque immobilisation est exigée
  @IsString() @MinLength(3) reason: string;
  @IsOptional() @IsNumber() @Min(0) estimatedCost?: number;
}

export class ResolveDowntimeDto {
  @IsOptional() @IsNumber() @Min(0) actualCost?: number;
  @IsOptional() @IsString() resolutionNote?: string;
  @IsOptional() @IsString() invoiceUrl?: string;
}
