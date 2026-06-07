import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DatabaseModule } from './database/database.module';
import { NewsModule } from './news/news.module';

@Module({
  imports: [DatabaseModule, NewsModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
