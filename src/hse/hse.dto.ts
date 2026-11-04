import { IsArray, IsBoolean, IsDateString, IsIn, IsInt, IsNumber, IsOptional, IsString, Min, MinLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export const INCIDENT_TYPES = ['ACCIDENT', 'NEAR_MISS', 'DAMAGE', 'ENVIRONMENT', 'FIRE', 'OTHER'];
export const SEVERITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

export class IncidentPersonDto {
  @IsOptional() @IsString() userId?: string;
  @IsOptional() @IsString() driverId?: string;
  @IsOptional() @IsString() fullName?: string;
  @IsOptional() @IsString() injury?: string;
}

export class CreateIncidentDto {
  @IsString() siteId: string;
  @IsDateString() occurredAt: string;
  @IsIn(INCIDENT_TYPES) type: string;
  @IsIn(SEVERITIES) severity: string;
  @IsString() @MinLength(3) description: string;
  @IsOptional() @IsString() zone?: string;
  @IsOptional() @IsString() locationId?: string;
  @IsOptional() @IsString() riskCategory?: string;
  @IsOptional() @IsString() vehicleId?: string;
  @IsOptional() @IsString() itemId?: string;
  @IsOptional() @IsBoolean() lostTime?: boolean;
  @IsOptional() @IsInt() @Min(0) lostDays?: number;
  @IsOptional() @IsString() immediateAction?: string;
  @IsOptional() @IsString() clientOpId?: string;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => IncidentPersonDto) persons?: IncidentPersonDto[];
}

export class CloseIncidentDto {
  @IsString() @MinLength(3) rootCause: string;
}

export class CreateActionDto {
  @IsString() siteId: string;
  @IsString() @MinLength(3) title: string;
  @IsDateString() dueDate: string;
  @IsOptional() @IsString() incidentId?: string;
  @IsOptional() @IsString() inspectionId?: string;
  @IsOptional() @IsString() responsibleId?: string;
}

export class CreateTalkDto {
  @IsString() siteId: string;
  @IsString() @MinLength(3) theme: string;
  @IsDateString() plannedAt: string;
  @IsOptional() @IsString() locationId?: string;
}

export class AttendeeDto {
  @IsOptional() @IsString() userId?: string;
  @IsOptional() @IsString() driverId?: string;
  @IsOptional() @IsString() fullName?: string;
}
export class HoldTalkDto {
  @IsArray() @ValidateNested({ each: true }) @Type(() => AttendeeDto) attendees: AttendeeDto[];
  @IsOptional() @IsString() notes?: string;
}

export class CreateInspectionDto {
  @IsString() siteId: string;
  @IsIn(['WAREHOUSE', 'VEHICLE', 'FIRE_EXTINGUISHER', 'ZONE']) type: string;
  @IsOptional() @IsString() locationId?: string;
  @IsOptional() @IsString() vehicleId?: string;
  @IsOptional() @IsNumber() @Min(0) score?: number;
  @IsOptional() @IsBoolean() compliant?: boolean;
  @IsOptional() @IsString() notes?: string;
}

export class CreatePpeDto {
  @IsString() siteId: string;
  @IsString() ppeType: string;
  @IsDateString() issuedAt: string;
  @IsOptional() @IsString() userId?: string;
  @IsOptional() @IsString() driverId?: string;
  @IsOptional() @IsDateString() renewalDue?: string;
  @IsOptional() @IsBoolean() compliant?: boolean;
}

export class CreateTrainingDto {
  @IsString() title: string;
  @IsDateString() obtainedAt: string;
  @IsOptional() @IsDateString() expiresAt?: string;
  @IsOptional() @IsString() userId?: string;
  @IsOptional() @IsString() driverId?: string;
}

export class SetWorkedHoursDto {
  @IsString() siteId: string;
  // Premier jour du mois (AAAA-MM-01)
  @IsDateString() period: string;
  @IsNumber() @Min(0) hours: number;
}
