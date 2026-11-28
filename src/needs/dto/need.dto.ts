import { MAX_QUANTITY, MAX_UNIT_PRICE_GNF } from '../../common/limits';
import { Type } from 'class-transformer';
import { IsArray, IsIn, IsNumber, IsOptional, IsString, Min, MinLength, ValidateNested, ArrayMinSize, Max } from 'class-validator';

export class NeedLineDto {
  @IsOptional() @IsString() itemId?: string;
  @IsOptional() @IsString() vehicleId?: string;
  @IsString() @MinLength(2) designation: string;
  @IsNumber() @Min(0.01) @Max(MAX_QUANTITY) quantity: number;
  @IsOptional() @IsString() unit?: string;
  @IsOptional() @IsNumber() @Min(0) @Max(MAX_UNIT_PRICE_GNF) estimatedUnitPrice?: number;
  @IsOptional() @IsString() note?: string;
}

export class CreateNeedDto {
  @IsString() siteId: string;
  @IsString() @MinLength(3) title: string;
  @IsOptional() @IsIn(['NORMALE', 'URGENTE']) priority?: string;
  @IsOptional() @IsString() recipient?: string;
  @IsOptional() @IsString() justification?: string;
  @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => NeedLineDto)
  lines: NeedLineDto[];
}

export class UpdateNeedDto {
  @IsOptional() @IsString() @MinLength(3) title?: string;
  @IsOptional() @IsIn(['NORMALE', 'URGENTE']) priority?: string;
  @IsOptional() @IsString() recipient?: string;
  @IsOptional() @IsString() justification?: string;
  @IsOptional() @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => NeedLineDto)
  lines?: NeedLineDto[];
}

export class SetNeedStatusDto {
  @IsIn(['BROUILLON', 'ENVOYE', 'APPROUVE', 'REJETE', 'SATISFAIT', 'TRANSMIS_COMPTA']) status: string;
  @IsOptional() @IsString() note?: string;
}

export class SendNeedEmailDto {
  @IsOptional() @IsString() to?: string;
  // Circuit : Achats d'abord, puis comptabilité
  @IsOptional() @IsIn(['PURCHASING', 'ACCOUNTING']) stage?: 'PURCHASING' | 'ACCOUNTING';
}
