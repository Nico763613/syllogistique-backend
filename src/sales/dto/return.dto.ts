import { MAX_QUANTITY } from '../../common/limits';
import { IsArray, IsBoolean, IsNumber, IsOptional, IsString, Min, ValidateNested, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class ReturnLineDto {
  @IsString() itemId: string;
  @IsNumber() @Min(0.01) @Max(MAX_QUANTITY) quantity: number;
}

export class CreateSalesReturnDto {
  @IsString() salesInvoiceId: string;
  @IsString() reason: string;
  // Remise en stock des articles retournés (défaut : oui)
  @IsOptional() @IsBoolean() restock?: boolean;
  @IsArray() @ValidateNested({ each: true }) @Type(() => ReturnLineDto)
  lines: ReturnLineDto[];
}

export class RejectSalesReturnDto {
  @IsOptional() @IsString() note?: string;
}

export class CancelInvoiceDto {
  @IsString() reason: string;
}
