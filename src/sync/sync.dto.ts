import { IsArray, IsIn, IsObject, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class SyncOperationDto {
  @IsString() entity: string; // ex: "Trip", "FuelTransaction", "StockMovement"
  @IsString() entityId: string; // id local (client) — permet la déduplication
  @IsIn(['CREATE', 'UPDATE', 'DELETE']) operation: 'CREATE' | 'UPDATE' | 'DELETE';
  @IsObject() payload: Record<string, unknown>;
  @IsOptional() @IsString() deviceId?: string;
  // Date de dernière mise à jour de la fiche telle que le client la connaissait (ISO).
  // Sert à détecter un conflit si un autre utilisateur l'a modifiée entre-temps (§26).
  @IsOptional() @IsString() baseUpdatedAt?: string;
}

export class SyncPushDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SyncOperationDto)
  operations: SyncOperationDto[];
}
