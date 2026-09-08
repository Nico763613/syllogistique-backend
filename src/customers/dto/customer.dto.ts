import { IsEmail, IsNumber, IsOptional, IsString } from 'class-validator';

export class CreateCustomerDto {
  @IsString() siteId: string;
  @IsString() name: string;
  @IsOptional() @IsString() contactName?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsString() taxNumber?: string;
  @IsOptional() @IsNumber() creditLimit?: number;
  @IsOptional() @IsString() observations?: string;
}

export class UpdateCustomerDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() contactName?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsString() taxNumber?: string;
  @IsOptional() @IsNumber() creditLimit?: number;
  @IsOptional() @IsString() observations?: string;
}
