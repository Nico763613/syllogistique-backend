import { IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreateInventoryItemDto {
  @IsString() siteId: string;
  @IsOptional() @IsString() categoryId?: string;
  @IsString() sku: string;
  @IsString() name: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() brand?: string;
  @IsOptional() @IsString() reference?: string;
  @IsOptional() @IsString() unit?: string;
  @IsOptional() @IsNumber() @Min(0) currentQuantity?: number;
  @IsOptional() @IsNumber() @Min(0) minimumQuantity?: number;
  @IsOptional() @IsNumber() @Min(0) maximumQuantity?: number;
  @IsOptional() @IsNumber() @Min(0) unitPrice?: number;
  @IsOptional() @IsString() location?: string;
  @IsOptional() @IsString() supplierId?: string;
  @IsOptional() @IsString() photoUrl?: string;
}

export class StockInDto {
  @IsString() itemId: string;
  @IsString() siteId: string;
  @IsNumber() @Min(0.01) quantity: number;
  @IsOptional() @IsString() supplierId?: string;
  @IsOptional() @IsString() reference?: string;
  @IsOptional() @IsNumber() @Min(0) unitPrice?: number;
  @IsOptional() @IsString() observations?: string;
}

export class StockOutDto {
  @IsString() itemId: string;
  @IsString() siteId: string;
  @IsNumber() @Min(0.01) quantity: number;
  @IsOptional() @IsString() vehicleId?: string;
  @IsOptional() @IsString() reason?: string;
  @IsOptional() @IsString() observations?: string;
  // Un magasinier peut être autorisé à forcer une sortie au-delà du stock disponible
  @IsOptional() allowNegative?: boolean;
}
