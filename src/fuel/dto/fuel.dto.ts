import { IsDateString, IsIn, IsInt, IsNumber, IsOptional, IsString, MinLength, Min } from 'class-validator';

export class CreateFuelTransactionDto {
  @IsString() vehicleId: string;
  @IsOptional() @IsString() driverId?: string;
  @IsString() siteId: string;
  @IsDateString() transactionDate: string;
  @IsInt() @Min(0) mileage: number;
  @IsNumber() @Min(0.01) quantityLiters: number;
  // Ignoré : le tarif central (Paramètres, 12 000 GNF/L par défaut) s'applique toujours côté serveur
  @IsOptional() @IsNumber() @Min(0) pricePerLiter?: number;
  @IsOptional() @IsString() station?: string;
  @IsOptional() @IsString() receiptNumber?: string;
  @IsOptional() @IsString() receiptImageUrl?: string;
  @IsOptional() @IsString() observations?: string;
  // STATION (pompe externe) ou TANK (cuve du site) ; compteur horaire pour les engins
  @IsOptional() @IsIn(['STATION', 'TANK']) source?: string;
  @IsOptional() @IsNumber() @Min(0) hours?: number;
}

// Correction d'une saisie de carburant : le motif est obligatoire (Audit Trail)
export class CorrectFuelTransactionDto {
  @IsString() @MinLength(3) reason: string;
  @IsOptional() @IsInt() @Min(0) mileage?: number;
  @IsOptional() @IsNumber() @Min(0.01) quantityLiters?: number;
  @IsOptional() @IsNumber() @Min(1) pricePerLiter?: number;
  @IsOptional() @IsDateString() transactionDate?: string;
  @IsOptional() @IsString() station?: string;
  @IsOptional() @IsString() receiptNumber?: string;
  @IsOptional() @IsString() observations?: string;
}
