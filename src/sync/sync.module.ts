import { Module } from '@nestjs/common';
import { SyncService } from './sync.service';
import { SyncController } from './sync.controller';
import { ConflictsService } from './conflicts.service';

@Module({
  controllers: [SyncController],
  providers: [SyncService, ConflictsService],
  exports: [ConflictsService],
})
export class SyncModule {}
