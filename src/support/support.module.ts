import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { SupportController } from './support.controller';
import { ErrorMonitorFilter } from './error-monitor.filter';

@Module({ controllers: [SupportController], providers: [{ provide: APP_FILTER, useClass: ErrorMonitorFilter }] })
export class SupportModule {}
