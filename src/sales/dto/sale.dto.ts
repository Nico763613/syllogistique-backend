import { IsArray, IsDateString, IsIn, IsNumber, IsOptional, IsString, Min, Max, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class SalesOrderLineDto {
  @IsString() itemId: string;
  @IsNumber() @Min(0.01) quantityOrdered: number;
  @IsNumber() @Min(0) unitPrice: number;
}

export class CreateSalesOrderDto {
  @IsString() siteId: string;
  @IsString() customerId: string;
  @IsDateString() orderDate: string;
  @IsOptional() @IsIn(['QUOTE', 'CONFIRMED']) status?: 'QUOTE' | 'CONFIRMED';
  @IsOptional() @IsNumber() @Min(0) @Max(100) discountPercent?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(100) taxPercent?: number;
  // Type de vente : comptant, crédit, échelonnée ou promotionnelle (défaut : comptant)
  @IsOptional() @IsIn(['CASH', 'CREDIT', 'INSTALLMENT', 'PROMO']) saleType?: 'CASH' | 'CREDIT' | 'INSTALLMENT' | 'PROMO';
  @IsOptional() @IsString() notes?: string;
  @IsArray() @ValidateNested({ each: true }) @Type(() => SalesOrderLineDto)
  lines: SalesOrderLineDto[];
}

export class DeliverLineDto {
  @IsString() lineId: string;
  @IsNumber() @Min(0.01) quantityDelivered: number;
}

export class DeliverSalesOrderDto {
  @IsArray() @ValidateNested({ each: true }) @Type(() => DeliverLineDto)
  lines: DeliverLineDto[];
  @IsOptional() allowNegative?: boolean;
}

export class InstallmentDto {
  @IsDateString() dueDate: string;
  @IsNumber() @Min(1) amount: number;
}

export class CreateSalesInvoiceDto {
  @IsOptional() @IsDateString() dueDate?: string;
  @IsIn(['CASH', 'CREDIT']) paymentTerm: 'CASH' | 'CREDIT';
  // Vente échelonnée : échéances dont la somme doit égaler le total TTC de la facture
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => InstallmentDto)
  installments?: InstallmentDto[];
}
