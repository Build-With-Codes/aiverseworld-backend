import {
  Body,
  Controller,
  Get,
  Headers,
  Post,
  Query,
  UnauthorizedException,
} from '@nestjs/common';
import { NewsService } from './news.service';
import type { NewsSourceArticle } from './news.types';

@Controller('api/news')
export class NewsController {
  constructor(private readonly newsService: NewsService) {}

  @Get()
  async getArticles(
    @Query('limit') limit?: string,
    @Query('category') category?: string,
  ) {
    return {
      data: await this.newsService.getArticles({
        limit: limit ? Number(limit) : undefined,
        category,
      }),
      legal: {
        summaryOnly: true,
        attributionRequired: true,
        note: 'Summaries are AI-generated from source metadata and article text. Users should visit the original source for full context.',
      },
    };
  }

  @Get('health')
  getHealth() {
    return this.newsService.getHealth();
  }

  @Get('sources')
  async getSources() {
    return {
      data: await this.newsService.getSources(),
    };
  }

  @Get('runs')
  async getRuns(@Query('limit') limit?: string) {
    return {
      data: await this.newsService.getRecentRuns(limit ? Number(limit) : 20),
    };
  }

  @Post('refresh')
  async refresh(
    @Headers('x-ingest-secret') ingestSecret?: string,
    @Body() body?: { limit?: number; category?: string },
  ) {
    this.assertSecret(ingestSecret);

    return {
      data: await this.newsService.refreshArticles({
        ...body,
        trigger: 'manual',
      }),
    };
  }

  @Post('refresh/cron')
  async refreshCron(
    @Headers('x-ingest-secret') ingestSecret?: string,
    @Body() body?: { limit?: number; category?: string },
  ) {
    this.assertSecret(ingestSecret);

    return {
      data: await this.newsService.refreshArticles({
        ...body,
        trigger: 'cron',
      }),
    };
  }

  @Post('ingest')
  async ingest(
    @Headers('x-ingest-secret') ingestSecret: string | undefined,
    @Body() article: NewsSourceArticle,
  ) {
    this.assertSecret(ingestSecret);

    return {
      data: await this.newsService.ingestArticle(article),
    };
  }

  private assertSecret(secret: string | undefined) {
    const expected = process.env.INGEST_SECRET;

    if (expected && secret !== expected) {
      throw new UnauthorizedException('Invalid ingest secret');
    }
  }
}
