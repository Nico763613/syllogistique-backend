import { Module } from '@nestjs/common';
import { SupportController } from './support.controller';

@Module({ controllers: [SupportController] })
export class SupportModule {}
