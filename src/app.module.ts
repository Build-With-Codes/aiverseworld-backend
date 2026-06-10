import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DatabaseModule } from './database/database.module';
import { GamesModule } from './games/games.module';
import { NewsModule } from './news/news.module';

@Module({
  imports: [DatabaseModule, NewsModule, GamesModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
