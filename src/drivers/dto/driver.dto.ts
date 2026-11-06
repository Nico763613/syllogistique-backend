import { IsDateString, IsEnum, IsIn, IsOptional, IsString } from 'class-validator';
import { DriverStatus, AttendanceStatus } from '@prisma/client';

export class CreateDriverDto {
  @IsString() firstName: string;
  @IsString() lastName: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() licenseNumber?: string;
  @IsOptional() @IsString() licenseCategory?: string;
  @IsOptional() @IsDateString() licenseExpiryDate?: string;
  @IsOptional() @IsString() photoUrl?: string;
  @IsOptional() @IsString() observations?: string;
  @IsOptional() @IsIn(['TRUCK', 'SERVICE_VEHICLE']) activity?: string;
  @IsString() siteId: string;
}

export class UpdateDriverDto {
  @IsOptional() @IsString() firstName?: string;
  @IsOptional() @IsString() lastName?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() licenseNumber?: string;
  @IsOptional() @IsString() licenseCategory?: string;
  @IsOptional() @IsDateString() licenseExpiryDate?: string;
  @IsOptional() @IsEnum(DriverStatus) status?: DriverStatus;
  @IsOptional() @IsIn(['TRUCK', 'SERVICE_VEHICLE']) activity?: string;
  @IsOptional() @IsString() photoUrl?: string;
  @IsOptional() @IsString() observations?: string;
}

export class MarkAttendanceDto {
  @IsString() driverId: string;
  @IsString() siteId: string;
  @IsDateString() date: string;
  @IsEnum(AttendanceStatus) status: AttendanceStatus;
  @IsOptional() @IsString() absenceReason?: string;
  @IsOptional() @IsDateString() checkIn?: string;
  @IsOptional() @IsDateString() checkOut?: string;
  // Obligatoire quand le pointage du jour existe déjà (correction d'erreur)
  @IsOptional() @IsString() correctionReason?: string;
}
