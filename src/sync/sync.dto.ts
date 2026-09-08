import { IsArray, IsIn, IsObject, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class SyncOperationDto {
  @IsString() entity: string; // ex: "Trip", "FuelTransaction", "StockMovement"
  @IsString() entityId: string; // id local (client) — permet la déduplication
  @IsIn(['CREATE', 'UPDATE', 'DELETE']) operation: 'CREATE' | 'UPDATE' | 'DELETE';
  @IsObject() payload: Record<string, unknown>;
  @IsOptional() @IsString() deviceId?: string;
}

export class SyncPushDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SyncOperationDto)
  operations: SyncOperationDto[];
}
