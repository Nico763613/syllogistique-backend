import { ArrayMinSize, IsArray, IsDateString, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class TransportInvoiceDto {
  @IsString() customerId: string;
  @IsArray() @ArrayMinSize(1) @IsString({ each: true }) tripIds: string[];
  @IsOptional() @IsNumber() @Min(1) pricePerTon?: number;
  @IsOptional() @IsDateString() dueDate?: string;
}
