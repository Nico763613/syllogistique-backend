import { IsDateString, IsIn, IsNumber, IsOptional, IsPositive, IsString } from 'class-validator';

export const EXPENSE_CATEGORIES = ['FUEL', 'MAINTENANCE', 'PARTS', 'TIRES', 'PURCHASE', 'TRANSPORT', 'OTHER'] as const;

export class CreateExpenseDto {
  @IsOptional() @IsString() vehicleId?: string;
  @IsIn(EXPENSE_CATEGORIES as unknown as string[]) category: string;
  @IsNumber() @IsPositive() amount: number;
  @IsDateString() expenseDate: string;
  @IsOptional() @IsString() description?: string;
}
