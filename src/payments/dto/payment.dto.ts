import { IsDateString, IsIn, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreatePaymentDto {
  @IsIn(['IN', 'OUT']) direction: 'IN' | 'OUT';
  @IsIn(['CASH', 'BANK_TRANSFER', 'MOBILE_MONEY', 'CHEQUE', 'OTHER']) method: string;
  @IsNumber() @Min(0.01) amount: number;
  @IsDateString() paymentDate: string;
  @IsOptional() @IsString() reference?: string;
  @IsOptional() @IsString() salesInvoiceId?: string;
  @IsOptional() @IsString() purchaseInvoiceId?: string;
}
