import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Post,
  Put,
  Query,
  UnauthorizedException,
} from '@nestjs/common';
import { ReviewsService } from './reviews.service';
import { PublicApiCacheService } from '../cache/public-api-cache.service';

function assertAdmin(headers: Record<string, string | string[] | undefined>) {
  const configuredKey = process.env.ADMIN_API_KEY?.trim();
  if (!configuredKey) {
    if (process.env.NODE_ENV === 'production') {
      throw new UnauthorizedException('ADMIN_API_KEY is not configured.');
    }
    return;
  }
  const rawKey = headers['x-admin-api-key'];
  const key = Array.isArray(rawKey) ? rawKey[0] : rawKey;
  const rawAuth = headers.authorization;
  const auth = Array.isArray(rawAuth) ? rawAuth[0] : rawAuth;
  const bearer = auth?.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (key !== configuredKey && bearer !== configuredKey) {
    throw new UnauthorizedException('Invalid admin API key.');
  }
}

function assertInternal(headers: Record<string, string | string[] | undefined>) {
  const configuredKey = process.env.INTERNAL_API_KEY?.trim();
  if (!configuredKey) {
    if (process.env.NODE_ENV === 'production') {
      throw new UnauthorizedException('INTERNAL_API_KEY is not configured.');
    }
    return;
  }
  const rawKey = headers['x-internal-api-key'];
  const key = Array.isArray(rawKey) ? rawKey[0] : rawKey;
  if (key !== configuredKey) {
    throw new UnauthorizedException('Invalid internal API key.');
  }
}

function requireUserId(userId?: string) {
  const trimmed = userId?.trim();
  if (!trimmed) throw new BadRequestException('userId is required.');
  return trimmed;
}

/** Public reads, nested under the tools resource. */
@Controller('api/tools/:toolId/reviews')
export class ToolReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @Get()
  list(
    @Param('toolId') toolId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.reviewsService.listForTool(toolId, page ? Number(page) : 1, limit ? Number(limit) : 10);
  }
}

/** Per-user writes — server-to-server only, mirrors MeController's internal-key gate. */
@Controller('api/me/reviews')
export class MeReviewsController {
  constructor(
    private readonly reviewsService: ReviewsService,
    private readonly cacheService: PublicApiCacheService,
  ) {}

  @Get()
  ownReview(
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Query('userId') userId?: string,
    @Query('toolId') toolId?: string,
  ) {
    assertInternal(headers);
    const uid = requireUserId(userId);
    if (!toolId?.trim()) throw new BadRequestException('toolId is required.');
    return this.reviewsService.getOwnReview(toolId.trim(), uid);
  }

  @Post()
  async submit(
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Body()
    body: {
      userId?: string;
      toolId?: string;
      authorName?: string;
      authorEmail?: string;
      authorImage?: string;
      rating?: number;
      comment?: string;
    },
  ) {
    assertInternal(headers);
    const userId = requireUserId(body?.userId);
    if (!body?.toolId) throw new BadRequestException('toolId is required.');
    if (!body?.authorName || !body?.authorEmail) {
      throw new BadRequestException('authorName and authorEmail are required.');
    }
    const result = await this.reviewsService.submit({
      toolId: body.toolId,
      userId,
      authorName: body.authorName,
      authorEmail: body.authorEmail,
      authorImage: body.authorImage,
      rating: Number(body.rating),
      comment: body.comment ?? '',
    });
    await this.cacheService.invalidate('review submit');
    return result;
  }

  @Put(':id')
  async update(
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Param('id') id: string,
    @Body() body: { userId?: string; rating?: number; comment?: string },
  ) {
    assertInternal(headers);
    const userId = requireUserId(body?.userId);
    const result = await this.reviewsService.update(id, userId, Number(body?.rating), body?.comment ?? '');
    await this.cacheService.invalidate('review update');
    return result;
  }

  @Delete(':id')
  async remove(
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Param('id') id: string,
    @Query('userId') userId?: string,
  ) {
    assertInternal(headers);
    const uid = requireUserId(userId);
    const result = await this.reviewsService.delete(id, uid);
    await this.cacheService.invalidate('review delete');
    return result;
  }
}

/** Admin moderation. */
@Controller('api/admin/reviews')
export class AdminReviewsController {
  constructor(
    private readonly reviewsService: ReviewsService,
    private readonly cacheService: PublicApiCacheService,
  ) {}

  @Get()
  list(
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    assertAdmin(headers);
    return this.reviewsService.adminList(page ? Number(page) : 1, limit ? Number(limit) : 30);
  }

  @Delete(':id')
  async remove(
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Param('id') id: string,
  ) {
    assertAdmin(headers);
    const result = await this.reviewsService.adminDelete(id);
    await this.cacheService.invalidate('admin review delete');
    return result;
  }
}
