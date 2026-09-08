import { IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { VehicleType, VehicleStatus } from '@prisma/client';

export class CreateVehicleDto {
  @IsEnum(VehicleType) vehicleType: VehicleType;
  @IsString() internalNumber: string;
  @IsString() registrationNumber: string;
  @IsOptional() @IsString() brand?: string;
  @IsOptional() @IsString() model?: string;
  @IsOptional() @IsInt() year?: number;
  @IsOptional() @IsString() capacity?: string;
  @IsOptional() @IsInt() @Min(0) currentMileage?: number;
  @IsOptional() @IsString() assignedDriverId?: string;
  @IsOptional() @IsString() photoUrl?: string;
  @IsOptional() @IsString() observations?: string;
  @IsString() siteId: string;
}

export class UpdateVehicleDto {
  @IsOptional() @IsString() internalNumber?: string;
  @IsOptional() @IsString() registrationNumber?: string;
  @IsOptional() @IsString() brand?: string;
  @IsOptional() @IsString() model?: string;
  @IsOptional() @IsInt() year?: number;
  @IsOptional() @IsString() capacity?: string;
  @IsOptional() @IsEnum(VehicleStatus) status?: VehicleStatus;
  @IsOptional() @IsString() assignedDriverId?: string;
  @IsOptional() @IsString() photoUrl?: string;
  @IsOptional() @IsString() observations?: string;
}
