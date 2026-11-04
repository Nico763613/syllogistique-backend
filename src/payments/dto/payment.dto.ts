import { IsDateString, IsIn, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreatePaymentDto {
  @IsIn(['IN', 'OUT']) direction: 'IN' | 'OUT';
  @IsIn(['CASH', 'BANK_TRANSFER', 'MOBILE_MONEY', 'ORANGE_MONEY', 'CHEQUE', 'OTHER']) method: string;
  @IsNumber() @Min(0.01) amount: number;
  @IsDateString() paymentDate: string;
  @IsOptional() @IsString() reference?: string;
  @IsOptional() @IsString() salesInvoiceId?: string;
  @IsOptional() @IsString() purchaseInvoiceId?: string;
  // Caisse et mobile money : session de caisse, n° de transaction, identifiant d'opération hors-ligne (anti-doublon)
  @IsOptional() @IsString() cashSessionId?: string;
  @IsOptional() @IsString() externalRef?: string;
  @IsOptional() @IsString() clientOpId?: string;
}
