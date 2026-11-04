import { IsArray, IsBoolean, IsDateString, IsIn, IsNumber, IsOptional, IsString, Min, MinLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export const REASON_CODES = ['RECEIPT', 'CONSUMPTION', 'SALE', 'RETURN', 'LOSS', 'BREAKAGE', 'DONATION', 'SCRAP', 'COUNT_GAP'];
export const VALUATION_METHODS = ['FIFO', 'LIFO', 'CMUP'];

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
  @IsOptional() @IsString() locationId?: string;
  @IsOptional() @IsIn(VALUATION_METHODS) valuationMethod?: string;
  @IsOptional() @IsNumber() @Min(0) reorderPoint?: number;
  @IsOptional() @IsNumber() @Min(0) taxRate?: number;
  @IsOptional() @IsNumber() @Min(0) salePrice?: number;
  @IsOptional() @IsBoolean() hasExpiry?: boolean;
  @IsOptional() @IsBoolean() isHazardous?: boolean;
  @IsOptional() @IsString() sdsUrl?: string;
}

export class StockInDto {
  @IsString() itemId: string;
  @IsString() siteId: string;
  @IsNumber() @Min(0.01) quantity: number;
  @IsOptional() @IsString() supplierId?: string;
  @IsOptional() @IsString() reference?: string;
  @IsOptional() @IsNumber() @Min(0) unitPrice?: number;
  // Motif obligatoire (approvisionnement, retour, dépotage…)
  @IsString() @MinLength(3) reason: string;
  @IsOptional() @IsString() observations?: string;
  // Traçabilité : lot, péremption, emplacement, motif codifié
  @IsOptional() @IsString() lotNumber?: string;
  @IsOptional() @IsDateString() expiryDate?: string;
  @IsOptional() @IsString() locationId?: string;
  @IsOptional() @IsIn(REASON_CODES) reasonCode?: string;
}

export class StockOutDto {
  @IsString() itemId: string;
  @IsString() siteId: string;
  @IsNumber() @Min(0.01) quantity: number;
  @IsOptional() @IsString() vehicleId?: string;
  // Motif obligatoire (livraison, consommation, panne…)
  @IsString() @MinLength(3) reason: string;
  @IsOptional() @IsString() observations?: string;
  // Un magasinier peut être autorisé à forcer une sortie au-delà du stock disponible
  @IsOptional() allowNegative?: boolean;
  @IsOptional() @IsString() locationId?: string;
  @IsOptional() @IsIn(REASON_CODES) reasonCode?: string;
}

// Correction d'un mouvement de stock : motif obligatoire (Audit Trail)
export class CorrectStockMovementDto {
  @IsNumber() @Min(0.01) quantity: number;
  @IsString() @MinLength(3) reason: string;
  @IsOptional() @IsBoolean() allowNegative?: boolean;
}

// Modification d'un article (notamment les seuils d'alerte) : motif obligatoire (Audit Trail)
export class UpdateInventoryItemDto {
  @IsString() @MinLength(3) reason: string;
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() brand?: string;
  @IsOptional() @IsString() reference?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() location?: string;
  @IsOptional() @IsNumber() @Min(0) minimumQuantity?: number;
  @IsOptional() @IsNumber() @Min(0) maximumQuantity?: number;
  @IsOptional() @IsNumber() @Min(0) unitPrice?: number;
  @IsOptional() @IsString() locationId?: string;
  @IsOptional() @IsIn(VALUATION_METHODS) valuationMethod?: string;
  @IsOptional() @IsNumber() @Min(0) reorderPoint?: number;
  @IsOptional() @IsNumber() @Min(0) taxRate?: number;
  @IsOptional() @IsNumber() @Min(0) salePrice?: number;
  @IsOptional() @IsBoolean() hasExpiry?: boolean;
  @IsOptional() @IsBoolean() isHazardous?: boolean;
  @IsOptional() @IsString() sdsUrl?: string;
}

// ---- Inventaire physique ----
export class StartInventoryCountDto {
  @IsString() siteId: string;
  // Entrepôt / emplacement à compter (vide = tous les articles du site)
  @IsOptional() @IsString() location?: string;
  @IsOptional() @IsString() note?: string;
}

export class CountLineDto {
  @IsString() itemId: string;
  @IsNumber() @Min(0) countedQuantity: number;
  @IsOptional() @IsString() note?: string;
}

export class SaveCountLinesDto {
  @IsArray() @ValidateNested({ each: true }) @Type(() => CountLineDto)
  lines: CountLineDto[];
}

// Validation / annulation d'un inventaire : motif obligatoire (Audit Trail)
export class CloseInventoryCountDto {
  @IsString() @MinLength(3) reason: string;
}

// Transfert d'un article d'un site / entrepôt vers un autre (même code article)
export class TransferStockDto {
  @IsString() itemId: string;
  @IsString() toSiteId: string;
  @IsNumber() @Min(0.01) quantity: number;
  @IsString() @MinLength(3) reason: string;
}
