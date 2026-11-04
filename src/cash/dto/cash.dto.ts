import { IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class OpenCashSessionDto {
  @IsOptional() @IsString() siteId?: string;
  @IsOptional() @IsNumber() @Min(0) openingFloat?: number;
}

export class CloseCashSessionDto {
  @IsNumber() @Min(0) countedCash: number;
  @IsOptional() @IsString() note?: string;
}

export class CashExpenseDto {
  @IsNumber() @Min(1) amount: number;
  @IsString() reason: string;
}
