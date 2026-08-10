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
import { EngagementService } from './engagement.service';
import { ToolRagIndexService } from './tool-rag-index.service';
import { ToolRagRecommendationService } from './tool-rag-recommendation.service';
import { parseAdminToolsCsv } from './tools-csv.util';
import { ToolsService } from './tools.service';
import type { AdminToolInput, AdminToolUpdateInput } from './tools.types';

function assertAdmin(headers: Record<string, string | string[] | undefined>) {
  const configuredKey = process.env.ADMIN_API_KEY?.trim();

  if (!configuredKey) {
    // Fail closed in every environment — an unconfigured secret must never
    // silently disable authentication, even in local dev.
    throw new UnauthorizedException('ADMIN_API_KEY is not configured.');
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
    private readonly engagementService: EngagementService,
  ) {}

  @Post('events')
  async recordEvent(
    @Res({ passthrough: true }) response: Response,
    @Body()
    body: {
      type?: string;
      toolId?: string;
      userId?: string;
      anonId?: string;
      query?: string;
      metadata?: Record<string, unknown>;
    },
  ) {
    response.setHeader('Cache-Control', 'no-store');

    if (!body?.type) {
      throw new BadRequestException('Event type is required.');
    }

    const result = await this.engagementService.recordEvent({
      type: body.type,
      toolId: body.toolId,
      userId: body.userId,
      anonId: body.anonId,
      query: body.query,
      metadata: body.metadata,
    });

    return { data: result };
  }

  @Post('stats/recompute')
  async recomputeStats(
    @Headers() headers: Record<string, string | string[] | undefined>,
  ) {
    assertAdmin(headers);
    return { data: await this.engagementService.recomputeStats() };
  }

  @Get('trending')
  async trending(
    @Query('window') window?: string,
    @Query('limit') limit?: string,
  ) {
    return {
      data: await this.engagementService.getTrending(
        window?.trim() || '7d',
        limit ? Number(limit) : 12,
      ),
    };
  }

  @Get('rankings')
  async rankings(
    @Query('metric') metric?: string,
    @Query('limit') limit?: string,
  ) {
    return {
      data: await this.engagementService.getRankings(
        metric?.trim() || 'most-saved',
        limit ? Number(limit) : 12,
      ),
    };
  }

  @Get('spotlights')
  async spotlights() {
    return this.engagementService.getSpotlights();
  }

  @Get('collections')
  collections() {
    return this.engagementService.getCollections();
  }

  @Get('collections/:slug')
  collection(@Param('slug') slug: string) {
    return this.engagementService.getCollection(slug);
  }

  @Get('related/:id')
  async related(@Param('id') id: string, @Query('limit') limit?: string) {
    return {
      data: await this.engagementService.getRelated(id, limit ? Number(limit) : 6),
    };
  }

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
    const { vectorIndex, vectorIndexError } = await this.indexToolSafely(tool);
    await this.cacheService.invalidate('admin tool upsert');

    return {
      data: this.toolsService.normalizeToolForResponse(tool),
      vectorIndex,
      ...(vectorIndexError ? { vectorIndexError } : {}),
    };
  }

  @Post('bulk')
  async upsertBulk(
    @Body() body: AdminToolInput[] | { tools?: AdminToolInput[] },
    @Headers() headers: Record<string, string | string[] | undefined>,
  ) {
    assertAdmin(headers);
    const inputs = getBulkTools(body);
    return this.processBulkUpsert(inputs);
  }

  @Post('import-csv')
  async importCsv(
    @Body() body: { csv?: string },
    @Headers() headers: Record<string, string | string[] | undefined>,
  ) {
    assertAdmin(headers);
    const csv = typeof body?.csv === 'string' ? body.csv : '';

    if (!csv.trim()) {
      throw new BadRequestException('Send CSV content in the "csv" field.');
    }

    const { inputs, rowNumbers, errors } = parseAdminToolsCsv(csv);

    if (inputs.length === 0) {
      throw new BadRequestException(
        errors[0]?.error ?? 'No importable data rows found in the CSV.',
      );
    }

    if (inputs.length > 1000) {
      throw new BadRequestException('CSV import supports up to 1000 data rows per request.');
    }

    const bulkResult = await this.processBulkUpsert(inputs, rowNumbers);

    return {
      ...bulkResult,
      skipped: errors.length,
      skippedRows: errors,
    };
  }

  private async processBulkUpsert(inputs: AdminToolInput[], rowNumbers?: number[]) {
    const results: Array<Record<string, unknown>> = [];
    let succeeded = 0;
    let failed = 0;

    for (const [index, input] of inputs.entries()) {
      const row = rowNumbers?.[index];

      try {
        const tool = await this.toolsService.upsertAdminTool(input);
        const { vectorIndex, vectorIndexError } = await this.indexToolSafely(tool);
        succeeded += 1;
        results.push({
          index,
          ...(row !== undefined ? { row } : {}),
          ok: true,
          data: this.toolsService.normalizeToolForResponse(tool),
          vectorIndex,
          ...(vectorIndexError ? { vectorIndexError } : {}),
        });
      } catch (error) {
        failed += 1;
        results.push({
          index,
          ...(row !== undefined ? { row } : {}),
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

  /**
   * The AiTool row is the source of truth; Pinecone is a secondary search index. A Pinecone
   * failure (bad credentials, network) must not be reported as a failed save when the row
   * upsert already committed — callers can retry indexing later via POST :id/reindex.
   */
  private async indexToolSafely(
    tool: Parameters<ToolRagIndexService['indexTool']>[0],
  ): Promise<{ vectorIndex: { toolId: string; chunks: number } | null; vectorIndexError?: string }> {
    try {
      return { vectorIndex: await this.ragIndexService.indexTool(tool) };
    } catch (error) {
      return {
        vectorIndex: null,
        vectorIndexError: error instanceof Error ? error.message : 'Unknown vector index error.',
      };
    }
  }

  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body() body: AdminToolUpdateInput,
    @Headers() headers: Record<string, string | string[] | undefined>,
  ) {
    assertAdmin(headers);
    const tool = await this.toolsService.updateAdminTool(id, body);
    const { vectorIndex, vectorIndexError } = await this.indexToolSafely(tool);
    await this.cacheService.invalidate('admin tool update');

    return {
      data: this.toolsService.normalizeToolForResponse(tool),
      vectorIndex,
      ...(vectorIndexError ? { vectorIndexError } : {}),
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
