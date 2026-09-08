import { IsArray, IsDateString, IsIn, IsNumber, IsOptional, IsString, Min, ValidateNested } from 'class-validator';
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
