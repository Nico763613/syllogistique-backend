import { IsDateString, IsInt, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreateFuelTransactionDto {
  @IsString() vehicleId: string;
  @IsOptional() @IsString() driverId?: string;
  @IsString() siteId: string;
  @IsDateString() transactionDate: string;
  @IsInt() @Min(0) mileage: number;
  @IsNumber() @Min(0.01) quantityLiters: number;
  // Si non fourni, le tarif par défaut du site (paramètres) est appliqué
  @IsOptional() @IsNumber() @Min(0) pricePerLiter?: number;
  @IsOptional() @IsString() station?: string;
  @IsOptional() @IsString() receiptNumber?: string;
  @IsOptional() @IsString() receiptImageUrl?: string;
  @IsOptional() @IsString() observations?: string;
}
