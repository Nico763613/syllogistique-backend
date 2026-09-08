import { IsDateString, IsInt, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreateMaintenanceDto {
  @IsString() vehicleId: string;
  @IsString() maintenanceTypeCode: string; // ex: VIDANGE
  @IsDateString() maintenanceDate: string;
  @IsOptional() @IsInt() @Min(0) mileage?: number;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() supplierId?: string;
  @IsOptional() @IsNumber() @Min(0) cost?: number;
  @IsOptional() @IsDateString() nextDate?: string;
  @IsOptional() @IsInt() @Min(0) nextMileage?: number;
  @IsOptional() @IsString() invoiceNumber?: string;
  @IsOptional() @IsString() invoiceUrl?: string;
}
