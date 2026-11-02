import { IsArray, IsDateString, IsIn, IsInt, IsNumber, IsOptional, IsString, Min, MinLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class PurchaseOrderLineDto {
  @IsString() itemId: string;
  @IsNumber() @Min(0.01) quantityOrdered: number;
  @IsNumber() @Min(0) unitPrice: number;
}

export class CreatePurchaseOrderDto {
  @IsString() siteId: string;
  @IsString() supplierId: string;
  @IsDateString() orderDate: string;
  @IsOptional() @IsDateString() expectedDate?: string;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsString() attachmentUrl?: string;
  @IsArray() @ValidateNested({ each: true }) @Type(() => PurchaseOrderLineDto)
  lines: PurchaseOrderLineDto[];
}

export class ReceiveLineDto {
  @IsString() lineId: string;
  @IsNumber() @Min(0.01) quantityReceived: number;
}

export class ReceivePurchaseOrderDto {
  @IsArray() @ValidateNested({ each: true }) @Type(() => ReceiveLineDto)
  lines: ReceiveLineDto[];
}

export class CreatePurchaseInvoiceDto {
  @IsOptional() @IsDateString() dueDate?: string;
  @IsIn(['CASH', 'CREDIT']) paymentTerm: 'CASH' | 'CREDIT';
}

// Réapprovisionnement automatique : génère des bons de commande BROUILLON par fournisseur
export class CreateReorderDraftsDto {
  @IsString() siteId: string;
  // Limiter à certains articles (sinon tous les articles à commander)
  @IsOptional() @IsArray() @IsString({ each: true }) itemIds?: string[];
  // Période d'analyse de la consommation (30 jours par défaut)
  @IsOptional() @IsInt() @Min(1) days?: number;
}

export class CancelPurchaseOrderDto {
  @IsString() @MinLength(3) reason: string;
}
