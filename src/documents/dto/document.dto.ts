import { IsDateString, IsIn, IsOptional, IsString } from 'class-validator';

export const DOCUMENT_TYPES = [
  'CARTE_GRISE',
  'ASSURANCE',
  'VISITE_TECHNIQUE',
  'PERMIS',
  'CONTRAT',
  'FACTURE',
  'MAINTENANCE',
  'AUTRE',
] as const;

export class CreateDocumentDto {
  @IsString() vehicleId: string;
  @IsIn(DOCUMENT_TYPES as unknown as string[]) type: string;
  @IsString() fileUrl: string; // URL retournée par POST /uploads
  @IsOptional() @IsDateString() expiryDate?: string;
}

export class UpdateDocumentDto {
  @IsOptional() @IsIn(DOCUMENT_TYPES as unknown as string[]) type?: string;
  @IsOptional() @IsString() fileUrl?: string;
  @IsOptional() @IsDateString() expiryDate?: string;
}
