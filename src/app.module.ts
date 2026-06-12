import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DatabaseModule } from './database/database.module';
import { EnglishTutorModule } from './english-tutor/english-tutor.module';
import { GamesModule } from './games/games.module';
import { NewsModule } from './news/news.module';

@Module({
  imports: [DatabaseModule, NewsModule, GamesModule, EnglishTutorModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
