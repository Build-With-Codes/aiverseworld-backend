import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { CacheModule } from './cache/cache.module';
import { DatabaseModule } from './database/database.module';
import { EnglishTutorModule } from './english-tutor/english-tutor.module';
import { GamesModule } from './games/games.module';
import { NewsModule } from './news/news.module';
import { ProblemsModule } from './problems/problems.module';
import { ToolsModule } from './tools/tools.module';

@Module({
  imports: [
    CacheModule,
    DatabaseModule,
    NewsModule,
    GamesModule,
    EnglishTutorModule,
    ProblemsModule,
    ToolsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
