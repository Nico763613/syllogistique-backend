import { IsIn, IsOptional, IsString } from 'class-validator';

export class CreateSiteDto {
  @IsString() name: string;
  @IsOptional() @IsString() location?: string;
  @IsOptional() @IsString() description?: string;
}

export class UpdateSiteDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() location?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsIn(['ACTIVE', 'INACTIVE']) status?: 'ACTIVE' | 'INACTIVE';
}
