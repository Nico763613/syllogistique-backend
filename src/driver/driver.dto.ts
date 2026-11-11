import { ArrayMaxSize, IsArray, IsEmail, IsIn, IsInt, IsNumber, IsObject, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

export class LinkDriverDto {
  @IsString() driverId: string;
  @IsEmail() email: string;
}

export class ProvisionDeviceDto {
  @IsString() driverId: string;
}

export class DeviceReasonDto {
  @IsString() @MinLength(3) @MaxLength(300) reason: string;
}

export class ActivateDeviceDto {
  // Code à 6 chiffres (OTP) ou contenu du QR code (SYLLO1:<id>:<jeton>)
  @IsString() @MinLength(6) @MaxLength(200) code: string;
  @IsOptional() @IsString() @MaxLength(200) fingerprint?: string;
  @IsOptional() @IsString() @MaxLength(120) model?: string;
  @IsOptional() @IsString() @MaxLength(120) os?: string;
}

export const OP_TYPES = ['start', 'arrive', 'fuel', 'breakdown', 'incident', 'maintenance', 'expense', 'pause'] as const;
export type OpType = (typeof OP_TYPES)[number];

export class SyncOpDto {
  @IsIn(OP_TYPES as unknown as string[]) type: OpType;
  @IsString() @MinLength(8) @MaxLength(80) clientOpId: string;
  @IsOptional() @IsString() tripId?: string;
  @IsObject() payload: Record<string, any>;
}

export class SyncDto {
  @IsArray() @ArrayMaxSize(100) ops: SyncOpDto[];
}

export class UpdateProfileDto {
  @IsString() @MinLength(6) @MaxLength(30) phone: string;
}

export class VehicleSpecDto {
  @IsOptional() @IsString() @MaxLength(40) truckType?: string;
  @IsOptional() @IsInt() @Min(2) @Max(40) wheels?: number;
  @IsOptional() @IsString() @MaxLength(40) capacity?: string;
}

export class PointerDto {
  @IsString() vehicleId: string;
  @IsString() day: string;
  @IsInt() @Min(0) @Max(500) movements: number;
  @IsNumber() @Min(0) @Max(100000) tons: number;
  @IsOptional() @IsString() @MaxLength(300) note?: string;
}

export class InviteDto {
  @IsString() driverId: string;
  @IsString() @MaxLength(200) appUrl: string;
}

export class ProcessSheetDto {
  @IsString() @MaxLength(36) driverId: string;
  @IsString() @MaxLength(10) date: string;
  @IsOptional() @IsString() @MaxLength(300) note?: string;
}

export class SendSheetDto {
  @IsString() @MaxLength(10) date: string;
}

export class TransferDeviceDto {
  @IsString() driverId: string;
  @IsOptional() @IsIn(['MALADIE', 'CONGE', 'AUTRE']) reason?: string;
}

export class ExpenseDecisionDto {
  @IsIn(['APPROVED', 'REJECTED']) decision: string;
  @IsOptional() @IsString() @MaxLength(300) note?: string;
}

export class TakeoverDto {
  @IsString() vehicleId: string;
  // MALADIE | CONGE | AUTRE
  @IsIn(['MALADIE', 'CONGE', 'AUTRE']) reason: string;
  @IsOptional() @IsString() @MaxLength(300) note?: string;
}
