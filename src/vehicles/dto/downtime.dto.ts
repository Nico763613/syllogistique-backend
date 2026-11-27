import { MAX_AMOUNT_GNF, MAX_QUANTITY } from '../../common/limits';
import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsDateString, IsIn, IsNumber, IsOptional, IsString, Min, MinLength, ValidateNested, Max } from 'class-validator';

export const DOWNTIME_CATEGORIES = ['PANNE', 'ACCIDENT', 'ENTRETIEN', 'ADMINISTRATIF', 'AUTRE'];
export const DOWNTIME_STAGES = ['DECLAREE', 'QUALIFIEE', 'EN_REPARATION', 'EN_ATTENTE_PIECES', 'REMISE_EN_SERVICE'];

export class ReportDowntimeDto {
  @IsString() vehicleId: string;
  @IsOptional() @IsIn(DOWNTIME_CATEGORIES) category?: string;
  // Motif obligatoire : la traçabilité de chaque immobilisation est exigée
  @IsString() @MinLength(3) reason: string;
  @IsOptional() @IsNumber() @Min(0) @Max(MAX_AMOUNT_GNF) estimatedCost?: number;
}

export class ResolveDowntimeDto {
  @IsOptional() @IsNumber() @Min(0) @Max(MAX_AMOUNT_GNF) actualCost?: number;
  @IsOptional() @IsString() resolutionNote?: string;
  @IsOptional() @IsString() invoiceUrl?: string;
}

// Qualification de la panne par la logistique : priorité, délai prévu, consigne à l'atelier
export class QualifyDowntimeDto {
  @IsIn(['NORMALE', 'URGENTE']) priority: string;
  @IsOptional() @IsDateString() expectedEndAt?: string;
  @IsOptional() @IsNumber() @Min(0) @Max(MAX_AMOUNT_GNF) estimatedCost?: number;
  @IsOptional() @IsString() note?: string;
}

export class PartLineDto {
  @IsString() @MinLength(2) designation: string;
  @IsNumber() @Min(0.01) @Max(MAX_QUANTITY) quantity: number;
  @IsOptional() @IsString() unit?: string;
}

// Demande de pièces : crée un état des besoins envoyé aux Achats
export class PartsRequestDto {
  @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => PartLineDto) lines: PartLineDto[];
  @IsOptional() @IsString() note?: string;
}

export class PartsReceivedDto {
  @IsOptional() @IsString() note?: string;
}
