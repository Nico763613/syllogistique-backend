import { IsBoolean, IsDateString, IsInt, IsNumber, IsOptional, IsString, Min } from 'class-validator';

// Plan d'entretien préventif d'un véhicule : « tous les X km et/ou tous les Y jours »
export class CreateMaintenancePlanDto {
  @IsString() vehicleId: string;
  @IsString() maintenanceTypeCode: string; // ex : VIDANGE
  @IsOptional() @IsInt() @Min(1) intervalKm?: number;
  @IsOptional() @IsInt() @Min(1) intervalDays?: number;
  @IsOptional() @IsInt() @Min(0) alertKm?: number;
  @IsOptional() @IsInt() @Min(0) alertDays?: number;
  // Dernier entretien déjà fait (sinon : kilométrage actuel et aujourd'hui servent de point de départ)
  @IsOptional() @IsInt() @Min(0) lastDoneKm?: number;
  @IsOptional() @IsDateString() lastDoneAt?: string;
}

export class UpdateMaintenancePlanDto {
  @IsOptional() @IsInt() @Min(1) intervalKm?: number;
  @IsOptional() @IsInt() @Min(1) intervalDays?: number;
  @IsOptional() @IsInt() @Min(0) alertKm?: number;
  @IsOptional() @IsInt() @Min(0) alertDays?: number;
  @IsOptional() @IsBoolean() active?: boolean;
}

// La logistique planifie l'entretien : date prévue + consigne à l'atelier
export class SchedulePlanDto {
  @IsDateString() maintenanceDate: string;
  @IsOptional() @IsString() note?: string;
}

// Le mécanicien déclare l'entretien effectué
export class CompleteMaintenanceDto {
  @IsOptional() @IsInt() @Min(0) mileage?: number;
  @IsOptional() @IsNumber() @Min(0) partsCost?: number;
  @IsOptional() @IsNumber() @Min(0) laborCost?: number;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() invoiceUrl?: string;
}
