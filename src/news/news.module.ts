import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { NewsCollectorService } from './news-collector.service';
import { NewsController } from './news.controller';
import { NewsRepository } from './news.repository';
import { NewsService } from './news.service';

@Module({
  imports: [DatabaseModule],
  controllers: [NewsController],
  providers: [NewsService, NewsCollectorService, NewsRepository],
  exports: [NewsService],
})
export class NewsModule {}
