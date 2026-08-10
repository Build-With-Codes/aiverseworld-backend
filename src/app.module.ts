import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { BlogModule } from './blog/blog.module';
import { BooksModule } from './books/books.module';
import { MediaModule } from './media/media.module';
import { ReviewsModule } from './reviews/reviews.module';
import { CacheModule } from './cache/cache.module';
import { DatabaseModule } from './database/database.module';
import { GamesModule } from './games/games.module';
import { NewsModule } from './news/news.module';
import { ProblemsModule } from './problems/problems.module';
import { SeoModule } from './seo/seo.module';
import { ToolsModule } from './tools/tools.module';
import { YoutubeModule } from './youtube/youtube.module';

@Module({
  imports: [
    CacheModule,
    DatabaseModule,
    BlogModule,
    BooksModule,
    MediaModule,
    ReviewsModule,
    NewsModule,
    GamesModule,
    ProblemsModule,
    SeoModule,
    ToolsModule,
    YoutubeModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
