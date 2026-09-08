import { IsEmail, IsOptional, IsString } from 'class-validator';

export class CreateSupplierDto {
  @IsString() name: string;
  @IsOptional() @IsString() contactName?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsString() productsSupplied?: string;
  @IsOptional() @IsString() observations?: string;
}

export class UpdateSupplierDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() contactName?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsString() productsSupplied?: string;
  @IsOptional() @IsString() observations?: string;
}
