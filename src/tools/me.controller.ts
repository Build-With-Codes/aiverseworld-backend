import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Post,
  Query,
  UnauthorizedException,
} from '@nestjs/common';
import { EngagementService } from './engagement.service';

/**
 * Per-user engagement API. These endpoints are called server-to-server by the
 * Next.js frontend AFTER it has verified the user's session; the frontend
 * passes the trusted `userId` and an internal shared secret. The browser never
 * calls these directly. Mirrors the `assertAdmin` API-key pattern.
 */
function assertInternal(
  headers: Record<string, string | string[] | undefined>,
) {
  const configuredKey = process.env.INTERNAL_API_KEY?.trim();

  if (!configuredKey) {
    if (process.env.NODE_ENV === 'production') {
      throw new UnauthorizedException('INTERNAL_API_KEY is not configured.');
    }
    return; // dev-permissive, like assertAdmin
  }

  const rawKey = headers['x-internal-api-key'];
  const key = Array.isArray(rawKey) ? rawKey[0] : rawKey;

  if (key !== configuredKey) {
    throw new UnauthorizedException('Invalid internal API key.');
  }
}

function requireUserId(userId?: string) {
  const trimmed = userId?.trim();
  if (!trimmed) {
    throw new BadRequestException('userId is required.');
  }
  return trimmed;
}

@Controller('api/me')
export class MeController {
  constructor(private readonly engagementService: EngagementService) {}

  @Get('saved')
  async saved(
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Query('userId') userId?: string,
  ) {
    assertInternal(headers);
    return { data: await this.engagementService.getSaved(requireUserId(userId)) };
  }

  @Post('saved')
  async save(
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Body() body: { userId?: string; toolId?: string },
  ) {
    assertInternal(headers);
    const userId = requireUserId(body?.userId);
    if (!body?.toolId?.trim()) {
      throw new BadRequestException('toolId is required.');
    }
    return {
      data: await this.engagementService.saveTool(userId, body.toolId.trim()),
    };
  }

  @Delete('saved')
  async unsave(
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Query('userId') userId?: string,
    @Query('toolId') toolId?: string,
  ) {
    assertInternal(headers);
    const uid = requireUserId(userId);
    if (!toolId?.trim()) {
      throw new BadRequestException('toolId is required.');
    }
    return {
      data: await this.engagementService.unsaveTool(uid, toolId.trim()),
    };
  }

  @Get('recently-viewed')
  async recentlyViewed(
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Query('userId') userId?: string,
    @Query('limit') limit?: string,
  ) {
    assertInternal(headers);
    return {
      data: await this.engagementService.getRecentlyViewed(
        requireUserId(userId),
        limit ? Number(limit) : 12,
      ),
    };
  }

  @Get('follows')
  async follows(
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Query('userId') userId?: string,
  ) {
    assertInternal(headers);
    return {
      data: await this.engagementService.getFollows(requireUserId(userId)),
    };
  }

  @Post('follows')
  async follow(
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Body() body: { userId?: string; category?: string },
  ) {
    assertInternal(headers);
    const userId = requireUserId(body?.userId);
    if (!body?.category?.trim()) {
      throw new BadRequestException('category is required.');
    }
    return {
      data: await this.engagementService.followCategory(
        userId,
        body.category.trim(),
      ),
    };
  }

  @Delete('follows')
  async unfollow(
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Query('userId') userId?: string,
    @Query('category') category?: string,
  ) {
    assertInternal(headers);
    const uid = requireUserId(userId);
    if (!category?.trim()) {
      throw new BadRequestException('category is required.');
    }
    return {
      data: await this.engagementService.unfollowCategory(uid, category.trim()),
    };
  }

  @Get('recommendations')
  async recommendations(
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Query('userId') userId?: string,
    @Query('limit') limit?: string,
  ) {
    assertInternal(headers);
    return {
      data: await this.engagementService.getRecommendations(
        requireUserId(userId),
        limit ? Number(limit) : 6,
      ),
    };
  }

  @Get('dashboard')
  async dashboard(
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Query('userId') userId?: string,
  ) {
    assertInternal(headers);
    return this.engagementService.getDashboard(requireUserId(userId));
  }
}
