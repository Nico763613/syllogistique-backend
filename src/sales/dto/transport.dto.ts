import { MAX_UNIT_PRICE_GNF } from '../../common/limits';
import { ArrayMinSize, IsArray, IsDateString, IsNumber, IsOptional, IsString, Min, Max } from 'class-validator';

export class TransportInvoiceDto {
  @IsString() customerId: string;
  @IsArray() @ArrayMinSize(1) @IsString({ each: true }) tripIds: string[];
  @IsOptional() @IsNumber() @Min(1) @Max(MAX_UNIT_PRICE_GNF) pricePerTon?: number;
  @IsOptional() @IsDateString() dueDate?: string;
}
