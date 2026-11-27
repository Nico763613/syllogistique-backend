import { MAX_AMOUNT_GNF } from '../../common/limits';
import { IsDateString, IsIn, IsNumber, IsOptional, IsPositive, IsString, Max } from 'class-validator';

export const EXPENSE_CATEGORIES = ['FUEL', 'MAINTENANCE', 'PARTS', 'TIRES', 'PURCHASE', 'TRANSPORT', 'OTHER'] as const;

export class CreateExpenseDto {
  @IsOptional() @IsString() vehicleId?: string;
  @IsIn(EXPENSE_CATEGORIES as unknown as string[]) category: string;
  @IsNumber() @IsPositive() @Max(MAX_AMOUNT_GNF) amount: number;
  @IsDateString() expenseDate: string;
  @IsOptional() @IsString() description?: string;
}
