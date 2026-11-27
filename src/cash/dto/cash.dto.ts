import { MAX_AMOUNT_GNF } from '../../common/limits';
import { IsNumber, IsOptional, IsString, Min, Max } from 'class-validator';

export class OpenCashSessionDto {
  @IsOptional() @IsString() siteId?: string;
  @IsOptional() @IsNumber() @Min(0) openingFloat?: number;
}

export class CloseCashSessionDto {
  @IsNumber() @Min(0) countedCash: number;
  @IsOptional() @IsString() note?: string;
}

export class CashExpenseDto {
  @IsNumber() @Min(1) @Max(MAX_AMOUNT_GNF) amount: number;
  @IsString() reason: string;
}

export class CashDecisionDto {
  @IsOptional() @IsString() note?: string;
}
