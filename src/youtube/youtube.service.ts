import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { ToolYoutubeVideo } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';

const CACHE_TTL_DAYS = 30;
const MAX_LIMIT = 6;
const MIN_VIDEO_DURATION_SECONDS = 5 * 60;
const MIN_VIDEO_VIEW_COUNT = 15_000;
const SEARCH_FETCH_LIMIT = 15;
const BLOCKED_TITLE_PATTERNS = [
  /\bno longer\b/i,
  /\bstopped using\b/i,
  /\bdon'?t use\b/i,
  /\bavoid\b/i,
  /\bscam\b/i,
  /\bexposed\b/i,
  /\bworst\b/i,
  /\bfail(?:ed|s)?\b/i,
  /\bdead\b/i,
  /\brant\b/i,
  /\broast\b/i,
];

type YoutubeSearchResponse = {
  items?: Array<{
    id?: { videoId?: string };
    snippet?: {
      title?: string;
      description?: string;
      channelTitle?: string;
      publishedAt?: string;
      thumbnails?: {
        default?: { url?: string };
        medium?: { url?: string };
        high?: { url?: string };
      };
    };
  }>;
};

type YoutubeVideosResponse = {
  items?: Array<{
    id?: string;
    contentDetails?: {
      duration?: string;
    };
    statistics?: {
      viewCount?: string;
    };
  }>;
};

@Injectable()
export class YoutubeService {
  private readonly logger = new Logger(YoutubeService.name);

  constructor(private readonly prismaService: PrismaService) {}

  async getToolVideos(toolKey: string, requestedLimit = 3) {
    const key = toolKey.trim();
    const slug = key.toLowerCase();

    if (!key) {
      throw new BadRequestException('Tool slug or id is required.');
    }

    const limit = Math.min(
      Math.max(Number.isFinite(requestedLimit) ? requestedLimit : 3, 1),
      MAX_LIMIT,
    );
    const prisma = this.prismaService.getClient();

    if (!prisma || !(await this.prismaService.ensureAvailable())) {
      throw new ServiceUnavailableException('Database is unavailable.');
    }

    await this.ensureYoutubeCacheShape(prisma);

    const tool = await prisma.aiTool.findFirst({
      where: { OR: [{ id: key }, { slug }] },
      select: {
        id: true,
        slug: true,
        name: true,
        company: true,
        category: true,
      },
    });

    if (!tool) {
      throw new NotFoundException('AI tool not found.');
    }

    const staleBefore = new Date(
      Date.now() - CACHE_TTL_DAYS * 24 * 60 * 60 * 1000,
    );
    const cached = await prisma.toolYoutubeVideo.findMany({
      where: { toolId: tool.id },
      orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
      take: limit,
    });

    if (
      cached.length > 0 &&
      cached.every((video) => video.fetchedAt > staleBefore)
    ) {
      return {
        data: cached.map((video) => this.normalizeVideo(video)),
        meta: {
          source: 'cache',
          cached: true,
          cacheTtlDays: CACHE_TTL_DAYS,
          fetchedAt: cached[0]?.fetchedAt.toISOString() ?? null,
        },
      };
    }

    const apiKey = process.env.YOUTUBE_API_KEY?.trim();
    if (!apiKey) {
      return {
        data: cached.map((video) => this.normalizeVideo(video)),
        meta: {
          source: cached.length > 0 ? 'stale-cache' : 'none',
          cached: cached.length > 0,
          unavailable: true,
          message: 'YOUTUBE_API_KEY is not configured.',
        },
      };
    }

    try {
      const freshVideos = await this.fetchYoutubeVideos({
        apiKey,
        query: this.buildSearchQuery(tool),
        limit,
      });

      if (freshVideos.length === 0) {
        return {
          data: cached.map((video) => this.normalizeVideo(video)),
          meta: {
            source: cached.length > 0 ? 'stale-cache' : 'youtube-api',
            cached: cached.length > 0,
            cacheTtlDays: CACHE_TTL_DAYS,
            message: 'YouTube API returned no matching videos.',
          },
        };
      }

      await prisma.$transaction([
        prisma.toolYoutubeVideo.deleteMany({ where: { toolId: tool.id } }),
        ...freshVideos.map((video) =>
          prisma.toolYoutubeVideo.create({
            data: {
              toolId: tool.id,
              toolSlug: tool.slug,
              videoId: video.videoId,
              title: video.title,
              channelTitle: video.channelTitle,
              description: video.description,
              thumbnailUrl: video.thumbnailUrl,
              durationSec: video.durationSec,
              viewCount: BigInt(video.viewCount),
              publishedAt: video.publishedAt,
              url: `https://www.youtube.com/watch?v=${video.videoId}`,
            },
          }),
        ),
      ]);

      const saved = await prisma.toolYoutubeVideo.findMany({
        where: { toolId: tool.id },
        orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
        take: limit,
      });

      return {
        data: saved.map((video) => this.normalizeVideo(video)),
        meta: {
          source: 'youtube-api',
          cached: false,
          cacheTtlDays: CACHE_TTL_DAYS,
          fetchedAt: new Date().toISOString(),
        },
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown YouTube API error';
      this.logger.warn(`YouTube refresh failed for ${tool.slug}: ${message}`);

      return {
        data: cached.map((video) => this.normalizeVideo(video)),
        meta: {
          source: cached.length > 0 ? 'stale-cache' : 'none',
          cached: cached.length > 0,
          unavailable: true,
          message,
        },
      };
    }
  }

  private buildSearchQuery(tool: {
    name: string;
    company: string;
    category: string;
  }) {
    return `${tool.name} ${tool.company} tutorial how to use beginner guide demo ${tool.category}`.slice(
      0,
      180,
    );
  }

  private async ensureYoutubeCacheShape(prisma: NonNullable<ReturnType<PrismaService['getClient']>>) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "aiverse_world"."ToolYoutubeVideo" (
        "id" TEXT NOT NULL,
        "toolId" TEXT NOT NULL,
        "toolSlug" TEXT NOT NULL,
        "videoId" TEXT NOT NULL,
        "title" TEXT NOT NULL,
        "channelTitle" TEXT,
        "description" TEXT,
        "thumbnailUrl" TEXT,
        "durationSec" INTEGER,
        "viewCount" BIGINT,
        "publishedAt" TIMESTAMP(3),
        "url" TEXT NOT NULL,
        "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL,
        CONSTRAINT "ToolYoutubeVideo_pkey" PRIMARY KEY ("id")
      )
    `);
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "aiverse_world"."ToolYoutubeVideo"
      ADD COLUMN IF NOT EXISTS "durationSec" INTEGER
    `);
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "aiverse_world"."ToolYoutubeVideo"
      ADD COLUMN IF NOT EXISTS "viewCount" BIGINT
    `);
    await prisma.$executeRawUnsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS "ToolYoutubeVideo_toolSlug_videoId_key"
      ON "aiverse_world"."ToolYoutubeVideo"("toolSlug", "videoId")
    `);
    await prisma.$executeRawUnsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS "ToolYoutubeVideo_toolId_videoId_key"
      ON "aiverse_world"."ToolYoutubeVideo"("toolId", "videoId")
    `);
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "ToolYoutubeVideo_toolSlug_idx"
      ON "aiverse_world"."ToolYoutubeVideo"("toolSlug")
    `);
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "ToolYoutubeVideo_toolId_idx"
      ON "aiverse_world"."ToolYoutubeVideo"("toolId")
    `);
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "ToolYoutubeVideo_fetchedAt_idx"
      ON "aiverse_world"."ToolYoutubeVideo"("fetchedAt")
    `);
  }

  private async fetchYoutubeVideos(input: {
    apiKey: string;
    query: string;
    limit: number;
  }) {
    const url = new URL('https://www.googleapis.com/youtube/v3/search');
    url.searchParams.set('part', 'snippet');
    url.searchParams.set('type', 'video');
    url.searchParams.set('maxResults', String(Math.max(input.limit, SEARCH_FETCH_LIMIT)));
    url.searchParams.set('q', input.query);
    url.searchParams.set('order', 'relevance');
    url.searchParams.set('safeSearch', 'strict');
    url.searchParams.set('videoEmbeddable', 'true');
    url.searchParams.set('videoDuration', 'medium');
    url.searchParams.set('key', input.apiKey);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);

    try {
      const response = await fetch(url, { signal: controller.signal });

      if (!response.ok) {
        throw new Error(`YouTube API returned ${response.status}`);
      }

      const payload = (await response.json()) as YoutubeSearchResponse;

      const candidates = (payload.items ?? [])
        .map((item) => {
          const videoId = item.id?.videoId?.trim();
          const snippet = item.snippet;

          if (!videoId || !snippet?.title) {
            return null;
          }

          const publishedAt = snippet.publishedAt
            ? new Date(snippet.publishedAt)
            : null;

          return {
            videoId,
            title: this.cleanText(snippet.title),
            description: this.cleanText(snippet.description ?? ''),
            channelTitle: this.cleanText(snippet.channelTitle ?? ''),
            thumbnailUrl:
              snippet.thumbnails?.high?.url ??
              snippet.thumbnails?.medium?.url ??
              snippet.thumbnails?.default?.url ??
              null,
            publishedAt:
              publishedAt && !Number.isNaN(publishedAt.getTime())
                ? publishedAt
                : null,
          };
        })
        .filter((video): video is NonNullable<typeof video> => Boolean(video))
        .filter((video) => this.isLearningVideoTitle(video.title))
        .slice(0, SEARCH_FETCH_LIMIT);

      if (candidates.length === 0) {
        return [];
      }

      const details = await this.fetchVideoDetails(
        input.apiKey,
        candidates.map((video) => video.videoId),
      );

      return candidates
        .map((video) => ({
          ...video,
          durationSec: details.get(video.videoId)?.durationSec ?? null,
          viewCount: details.get(video.videoId)?.viewCount ?? 0,
        }))
        .filter(
          (video) =>
            video.durationSec !== null &&
            video.durationSec >= MIN_VIDEO_DURATION_SECONDS &&
            video.viewCount >= MIN_VIDEO_VIEW_COUNT,
        )
        .slice(0, input.limit);
    } finally {
      clearTimeout(timeout);
    }
  }

  private async fetchVideoDetails(apiKey: string, videoIds: string[]) {
    const url = new URL('https://www.googleapis.com/youtube/v3/videos');
    url.searchParams.set('part', 'contentDetails,statistics');
    url.searchParams.set('id', videoIds.join(','));
    url.searchParams.set('key', apiKey);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);

    try {
      const response = await fetch(url, { signal: controller.signal });

      if (!response.ok) {
        throw new Error(`YouTube videos API returned ${response.status}`);
      }

      const payload = (await response.json()) as YoutubeVideosResponse;
      return new Map(
        (payload.items ?? [])
          .map((item) => {
            const id = item.id?.trim();
            const durationSec = this.parseIsoDuration(
              item.contentDetails?.duration,
            );
            const viewCount = this.parseViewCount(item.statistics?.viewCount);
            return id && durationSec
              ? ([id, { durationSec, viewCount }] as const)
              : null;
          })
          .filter(
            (
              item,
            ): item is readonly [
              string,
              { durationSec: number; viewCount: number },
            ] => Boolean(item),
          ),
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  private isLearningVideoTitle(title: string) {
    const normalized = title.toLowerCase();
    const hasLearningSignal = /\b(tutorial|guide|how to|demo|beginner|course|learn|walkthrough|explained|training)\b/i.test(
      normalized,
    );

    return hasLearningSignal && !BLOCKED_TITLE_PATTERNS.some((pattern) => pattern.test(title));
  }

  private parseIsoDuration(value?: string) {
    if (!value) {
      return null;
    }

    const match = value.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
    if (!match) {
      return null;
    }

    const hours = Number(match[1] ?? 0);
    const minutes = Number(match[2] ?? 0);
    const seconds = Number(match[3] ?? 0);
    return hours * 3600 + minutes * 60 + seconds;
  }

  private parseViewCount(value?: string) {
    if (!value) {
      return 0;
    }

    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  private cleanText(value: string) {
    return value.replace(/\s+/g, ' ').trim();
  }

  private normalizeVideo(video: ToolYoutubeVideo) {
    return {
      id: video.id,
      toolSlug: video.toolSlug,
      videoId: video.videoId,
      title: video.title,
      channelTitle: video.channelTitle,
      description: video.description,
      thumbnailUrl: video.thumbnailUrl,
      durationSec: video.durationSec,
      viewCount: video.viewCount?.toString() ?? null,
      publishedAt: video.publishedAt?.toISOString() ?? null,
      url: video.url,
      fetchedAt: video.fetchedAt.toISOString(),
    };
  }
}
