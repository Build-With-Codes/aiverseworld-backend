import { Controller, Get, Param, Query } from '@nestjs/common';
import { ToolRagIndexService } from './tool-rag-index.service';
import { ToolRagRecommendationService } from './tool-rag-recommendation.service';
import { ToolsService } from './tools.service';

@Controller('api/tools')
export class ToolsController {
  constructor(
    private readonly toolsService: ToolsService,
    private readonly ragRecommendationService: ToolRagRecommendationService,
    private readonly ragIndexService: ToolRagIndexService,
  ) {}

  @Get()
  async list(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('q') search?: string,
    @Query('category') category?: string,
    @Query('pricing') pricing?: string,
    @Query('platform') platform?: string,
    @Query('freeOnly') freeOnly?: string,
    @Query('apiOnly') apiOnly?: string,
    @Query('openSourceOnly') openSourceOnly?: string,
    @Query('sort') sort?: string,
  ) {
    return this.toolsService.list({
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 24,
      search: search?.trim() || undefined,
      category: category?.trim() || undefined,
      pricing: pricing?.trim() || undefined,
      platform: platform?.trim() || undefined,
      freeOnly: freeOnly === 'true',
      apiOnly: apiOnly === 'true',
      openSourceOnly: openSourceOnly === 'true',
      sort: this.toolsService.normalizeSort(sort),
    });
  }

  @Get('recommend')
  recommend(@Query('q') query?: string, @Query('limit') limit?: string) {
    return this.toolsService.recommend(query ?? '', limit ? Number(limit) : 8);
  }

  @Get('recommend/rag')
  recommendWithRag(@Query('q') query?: string, @Query('limit') limit?: string) {
    return this.ragRecommendationService.recommend(query ?? '', limit ? Number(limit) : 6);
  }

  @Get('rag/reindex')
  reindexRag() {
    return this.ragIndexService.indexAllTools();
  }

  @Get('categories')
  categories() {
    return this.toolsService.getCategories();
  }

  @Get('categories/:slug')
  category(
    @Param('slug') slug: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.toolsService.getCategory(
      slug,
      page ? Number(page) : 1,
      limit ? Number(limit) : 24,
    );
  }

  @Get('best')
  bestLists() {
    return this.toolsService.getBestLists();
  }

  @Get('best/:slug')
  bestList(
    @Param('slug') slug: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.toolsService.getBestList(
      slug,
      page ? Number(page) : 1,
      limit ? Number(limit) : 24,
    );
  }

  @Get('comparisons')
  comparisons(@Query('limit') limit?: string) {
    return this.toolsService.getComparisons(limit ? Number(limit) : 120);
  }

  @Get('comparisons/:slug')
  comparison(@Param('slug') slug: string) {
    return this.toolsService.getComparison(slug);
  }

  @Get('compare')
  compareByIds(@Query('leftId') leftId?: string, @Query('rightId') rightId?: string) {
    return this.toolsService.getComparisonByIds(leftId ?? '', rightId ?? '');
  }

  @Get('id/:id')
  async getById(@Param('id') id: string) {
    return {
      data: await this.toolsService.getById(id),
    };
  }

  @Get('slug/:slug')
  async getBySlugPath(@Param('slug') slug: string) {
    return {
      data: await this.toolsService.getBySlug(slug),
    };
  }

  @Get(':slug')
  async getBySlug(@Param('slug') slug: string) {
    return {
      data: await this.toolsService.getBySlug(slug),
    };
  }
}
