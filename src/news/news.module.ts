import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { NewsCollectorService } from './news-collector.service';
import { NewsController } from './news.controller';
import { NewsRepository } from './news.repository';
import { NewsSchedulerService } from './news.scheduler';
import { NewsService } from './news.service';

@Module({
  imports: [DatabaseModule],
  controllers: [NewsController],
  providers: [
    NewsService,
    NewsCollectorService,
    NewsRepository,
    NewsSchedulerService,
  ],
  exports: [NewsService],
})
export class NewsModule {}
