import { IsDateString, IsInt, IsOptional, IsString, Min } from 'class-validator';

export class CreateTripDto {
  @IsString() vehicleId: string;
  @IsString() driverId: string;
  @IsString() siteId: string;
  @IsDateString() tripDate: string;
  @IsDateString() startTime: string;
  @IsOptional() @IsDateString() endTime?: string;
  @IsInt() @Min(0) startMileage: number;
  @IsOptional() @IsInt() @Min(0) endMileage?: number;
  @IsOptional() @IsString() destination?: string;
  @IsOptional() @IsString() purpose?: string;
  @IsOptional() @IsString() passengerName?: string;
  @IsOptional() @IsString() observations?: string;
}

export class CloseTripDto {
  @IsDateString() endTime: string;
  @IsInt() @Min(0) endMileage: number;
  @IsOptional() @IsString() observations?: string;
}
