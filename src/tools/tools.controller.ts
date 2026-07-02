import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Put,
  Query,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import type { Response } from 'express';
import { PublicApiCacheService } from '../cache/public-api-cache.service';
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

function getBulkTools(body: AdminToolInput[] | { tools?: AdminToolInput[] }) {
  const tools = Array.isArray(body) ? body : body.tools;

  if (!Array.isArray(tools) || tools.length === 0) {
    throw new BadRequestException('Send a non-empty tools array.');
  }

  if (tools.length > 100) {
    throw new BadRequestException('Bulk tool upsert supports up to 100 tools per request.');
  }

  return tools;
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
  recommend(
    @Res({ passthrough: true }) response: Response,
    @Query('q') query?: string,
    @Query('limit') limit?: string,
  ) {
    response.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    response.setHeader('Pragma', 'no-cache');
    response.setHeader('Expires', '0');
    return this.toolsService.recommend(query ?? '', limit ? Number(limit) : 8);
  }

  @Get('recommend/rag')
  recommendWithRag(
    @Res({ passthrough: true }) response: Response,
    @Query('q') query?: string,
    @Query('limit') limit?: string,
  ) {
    response.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    response.setHeader('Pragma', 'no-cache');
    response.setHeader('Expires', '0');
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
    private readonly cacheService: PublicApiCacheService,
  ) {}

  @Post()
  async upsert(
    @Body() body: AdminToolInput,
    @Headers() headers: Record<string, string | string[] | undefined>,
  ) {
    assertAdmin(headers);
    const tool = await this.toolsService.upsertAdminTool(body);
    const vectorIndex = await this.ragIndexService.indexTool(tool);
    await this.cacheService.invalidate('admin tool upsert');

    return {
      data: this.toolsService.normalizeToolForResponse(tool),
      vectorIndex,
    };
  }

  @Post('bulk')
  async upsertBulk(
    @Body() body: AdminToolInput[] | { tools?: AdminToolInput[] },
    @Headers() headers: Record<string, string | string[] | undefined>,
  ) {
    assertAdmin(headers);
    const inputs = getBulkTools(body);
    const results: Array<Record<string, unknown>> = [];
    let succeeded = 0;
    let failed = 0;

    for (const [index, input] of inputs.entries()) {
      try {
        const tool = await this.toolsService.upsertAdminTool(input);
        const vectorIndex = await this.ragIndexService.indexTool(tool);
        succeeded += 1;
        results.push({
          index,
          ok: true,
          data: this.toolsService.normalizeToolForResponse(tool),
          vectorIndex,
        });
      } catch (error) {
        failed += 1;
        results.push({
          index,
          ok: false,
          slug: input?.slug,
          name: input?.name,
          error: error instanceof Error ? error.message : 'Unknown bulk upsert error.',
        });
      }
    }

    if (succeeded > 0) {
      await this.cacheService.invalidate('admin bulk tool upsert');
    }

    return {
      total: inputs.length,
      succeeded,
      failed,
      results,
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
    await this.cacheService.invalidate('admin tool update');

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
    const result = await this.ragIndexService.indexToolById(id);
    await this.cacheService.invalidate('admin tool reindex');
    return result;
  }
}
