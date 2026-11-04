import { IsArray, IsNumber, IsOptional, IsString, Min, MinLength, ValidateNested, ArrayMinSize } from 'class-validator';
import { Type } from 'class-transformer';

export class TransferLineDto {
  // Article du site d'origine
  @IsString() itemId: string;
  @IsNumber() @Min(0.01) quantity: number;
}

export class CreateTransferDto {
  @IsString() fromSiteId: string;
  @IsString() toSiteId: string;
  @IsOptional() @IsString() fromLocationId?: string;
  @IsOptional() @IsString() toLocationId?: string;
  @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => TransferLineDto)
  lines: TransferLineDto[];
}

export class ReceiveTransferDto {
  @IsOptional() @IsString() notes?: string;
}

export class CancelTransferDto {
  @IsString() @MinLength(3) reason: string;
}
