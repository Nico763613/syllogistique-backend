import { Module, Global } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { AuditService } from './audit.service';
import { AuditController } from './audit.controller';

@Global()
@Module({
  controllers: [AuditController],
  providers: [PrismaService, AuditService],
  exports: [AuditService, PrismaService],
})
export class AuditModule {}
