import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { AdminMediaController, MediaController } from './media.controller';
import { MediaService } from './media.service';
import { StorageService } from './storage.service';

@Module({
  imports: [DatabaseModule],
  controllers: [MediaController, AdminMediaController],
  providers: [MediaService, StorageService],
  exports: [MediaService],
})
export class MediaModule {}
