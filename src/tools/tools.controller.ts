import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Put,
  Query,
  UnauthorizedException,
} from '@nestjs/common';
import { ToolRagIndexService } from './tool-rag-index.service';
import { ToolRagRecommendationService } from './tool-rag-recommendation.service';
import { ToolsService } from './tools.service';
import type { AdminToolInput, AdminToolUpdateInput } from './tools.types';

function assertAdmin(headers: Record<string, string | string[] | undefined>) {
  const configuredKey = process.env.ADMIN_API_KEY?.trim();

  if (!configuredKey) {
    if (process.env.NODE_ENV === 'production') {
      throw new UnauthorizedException('ADMIN_API_KEY is not configured.');
    }

    return;
  }

  const rawAdminKey = headers['x-admin-api-key'];
  const adminKey = Array.isArray(rawAdminKey) ? rawAdminKey[0] : rawAdminKey;
  const rawAuthorization = headers.authorization;
  const authorization = Array.isArray(rawAuthorization)
    ? rawAuthorization[0]
    : rawAuthorization;
  const bearerToken = authorization?.startsWith('Bearer ')
    ? authorization.slice('Bearer '.length).trim()
    : '';

  if (adminKey !== configuredKey && bearerToken !== configuredKey) {
    throw new UnauthorizedException('Invalid admin API key.');
  }
}

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

@Controller('api/admin/tools')
export class AdminToolsController {
  constructor(
    private readonly toolsService: ToolsService,
    private readonly ragIndexService: ToolRagIndexService,
  ) {}

  @Post()
  async upsert(
    @Body() body: AdminToolInput,
    @Headers() headers: Record<string, string | string[] | undefined>,
  ) {
    assertAdmin(headers);
    const tool = await this.toolsService.upsertAdminTool(body);
    const vectorIndex = await this.ragIndexService.indexTool(tool);

    return {
      data: this.toolsService.normalizeToolForResponse(tool),
      vectorIndex,
    };
  }

  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body() body: AdminToolUpdateInput,
    @Headers() headers: Record<string, string | string[] | undefined>,
  ) {
    assertAdmin(headers);
    const tool = await this.toolsService.updateAdminTool(id, body);
    const vectorIndex = await this.ragIndexService.indexTool(tool);

    return {
      data: this.toolsService.normalizeToolForResponse(tool),
      vectorIndex,
    };
  }

  @Post(':id/reindex')
  async reindex(
    @Param('id') id: string,
    @Headers() headers: Record<string, string | string[] | undefined>,
  ) {
    assertAdmin(headers);
    return this.ragIndexService.indexToolById(id);
  }
}
