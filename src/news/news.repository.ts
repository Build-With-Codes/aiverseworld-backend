import { Injectable } from '@nestjs/common';
import {
  Prisma,
  type AiArticle,
  type NewsPipelineRun,
  type NewsSource,
  type RawArticle,
} from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import type {
  ProcessedArticle,
  RawStoredArticle,
  SourceRegistryItem,
} from './news.types';

type RunLogInput = {
  stage: string;
  status: string;
  trigger: string;
  message?: string;
  articleCount?: number;
  feedCount?: number;
  metadata?: Record<string, unknown>;
};

type StageRawArticleInput = {
  sourceName: string;
  externalId?: string;
  title: string;
  url: string;
  content: string;
  excerpt: string;
  author?: string;
  publishedAt: string;
  category?: string;
  imageUrl?: string;
  contentHash: string;
};

@Injectable()
export class NewsRepository {
  constructor(private readonly prisma: PrismaService) {}

  isEnabled() {
    return this.prisma.isAvailable();
  }

  private toJsonValue(
    value?: Record<string, unknown> | string[] | null,
  ) {
    return value as Prisma.InputJsonValue | undefined;
  }

  private formatRepositoryError(error: unknown) {
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      typeof (error as { code?: unknown }).code === 'string'
    ) {
      const prismaError = error as {
        code: string;
        message?: string;
        meta?: Record<string, unknown>;
      };

      if (prismaError.code === 'P2021') {
        const modelName =
          typeof prismaError.meta?.modelName === 'string'
            ? prismaError.meta.modelName
            : 'unknown model';

        return `Database table for model ${modelName} is missing. Run \`npm.cmd run prisma:migrate\` or \`npm.cmd run prisma:push\`.`;
      }

      if (prismaError.code === 'ECONNREFUSED') {
        return 'PostgreSQL refused the connection. Check DATABASE_URL, confirm Postgres is running, and verify the target database exists.';
      }

      return prismaError.message ?? `Prisma error ${prismaError.code}`;
    }

    if (error instanceof Error) {
      if (error.message.includes('ECONNREFUSED')) {
        return 'PostgreSQL refused the connection. Check DATABASE_URL, confirm Postgres is running, and verify the target database exists.';
      }

      return error.message;
    }

    return 'Unknown Prisma repository error';
  }

  private async safely<T>(action: () => Promise<T>, fallback: T) {
    const available = await this.prisma.ensureAvailable();

    if (!available) {
      return fallback;
    }

    try {
      return await action();
    } catch (error) {
      const message = this.formatRepositoryError(error);
      this.prisma.markUnavailable(message);
      return fallback;
    }
  }

  async syncSources(sources: SourceRegistryItem[]) {
    if (!(await this.prisma.ensureAvailable())) {
      return new Map<string, string>();
    }

    return this.safely(async () => {
      const client = this.prisma.getClient()!;
      const syncedSources = await Promise.all(
        sources.map((source) =>
          client.newsSource.upsert({
            where: { name: source.name },
            update: {
              type: source.type,
              baseUrl: source.baseUrl,
              isActive: true,
              pollIntervalMinutes: source.pollIntervalMinutes,
            },
            create: {
              name: source.name,
              type: source.type,
              baseUrl: source.baseUrl,
              isActive: true,
              pollIntervalMinutes: source.pollIntervalMinutes,
            },
          }),
        ),
      );

      return new Map(syncedSources.map((source) => [source.name, source.id]));
    }, new Map<string, string>());
  }

  async stageRawArticles(
    sourceIds: Map<string, string>,
    articles: StageRawArticleInput[],
  ) {
    if (!(await this.prisma.ensureAvailable())) {
      return [];
    }

    return this.safely(async () => {
      const client = this.prisma.getClient()!;
      const existingByUrl = new Map(
        (
          await client.rawArticle.findMany({
            where: { url: { in: articles.map((article) => article.url) } },
          })
        ).map((article) => [article.url, article]),
      );

      const contentHashFirstSeen = new Map<string, string>();
      const staged: RawStoredArticle[] = [];

      for (const article of articles) {
        const sourceId = sourceIds.get(article.sourceName);

        if (!sourceId) {
          continue;
        }

        const existing = existingByUrl.get(article.url);
        const duplicateOfId = contentHashFirstSeen.get(article.contentHash);
        const isDuplicate = Boolean(duplicateOfId);

        const stored = existing
          ? await client.rawArticle.update({
              where: { id: existing.id },
              data: {
                sourceId,
                externalId: article.externalId,
                title: article.title,
                content: article.content,
                excerpt: article.excerpt,
                author: article.author,
                publishedAt: new Date(article.publishedAt),
                contentHash: article.contentHash,
                status: isDuplicate ? 'duplicate' : 'fetched',
                category: article.category,
                imageUrl: article.imageUrl,
                isDuplicate,
                duplicateOfId,
              },
              include: { source: true },
            })
          : await client.rawArticle.create({
              data: {
                sourceId,
                externalId: article.externalId,
                title: article.title,
                url: article.url,
                content: article.content,
                excerpt: article.excerpt,
                author: article.author,
                publishedAt: new Date(article.publishedAt),
                contentHash: article.contentHash,
                status: isDuplicate ? 'duplicate' : 'fetched',
                category: article.category,
                imageUrl: article.imageUrl,
                isDuplicate,
                duplicateOfId,
              },
              include: { source: true },
            });

        if (!contentHashFirstSeen.has(article.contentHash)) {
          contentHashFirstSeen.set(article.contentHash, stored.id);
        }

        staged.push(this.mapRawArticle(stored, stored.source));
      }

      return staged;
    }, [] as RawStoredArticle[]);
  }

  async getLatestArticles(limit: number, category?: string) {
    if (!(await this.prisma.ensureAvailable())) {
      return [];
    }

    return this.safely(
      () =>
        this.prisma.getClient()!.aiArticle.findMany({
          where: {
            isPublished: true,
            ...(category
              ? { category: { equals: category, mode: 'insensitive' } }
              : {}),
          },
          orderBy: [{ processedAt: 'desc' }, { publishedAt: 'desc' }],
          take: limit,
        }),
      [],
    );
  }

  async publishArticles(articles: ProcessedArticle[]) {
    if (!(await this.prisma.ensureAvailable())) {
      return;
    }

    await this.safely(
      () =>
        Promise.all(
          articles.map((article) =>
            this.prisma.getClient()!.aiArticle.upsert({
              where: { rawArticleId: article.rawArticleId },
              update: {
                title: article.title,
                slug: article.slug,
                summary: article.summary,
                keyPoints: article.keyPoints,
                category: article.category,
                tags: [article.category],
                sourceUrl: article.sourceUrl,
                sourceName: article.sourceName,
                imageUrl: article.imageUrl,
                publishedAt: new Date(article.publishedAt),
                processedAt: new Date(article.processedAt),
                isPublished: true,
                copyrightOwner: article.legal.copyrightOwner,
                summaryOnly: article.legal.summaryOnly,
                takedownEmail: article.legal.takedownEmail,
              },
              create: {
                rawArticleId: article.rawArticleId,
                title: article.title,
                slug: article.slug,
                summary: article.summary,
                keyPoints: article.keyPoints,
                category: article.category,
                tags: [article.category],
                sourceUrl: article.sourceUrl,
                sourceName: article.sourceName,
                imageUrl: article.imageUrl,
                publishedAt: new Date(article.publishedAt),
                processedAt: new Date(article.processedAt),
                isPublished: true,
                copyrightOwner: article.legal.copyrightOwner,
                summaryOnly: article.legal.summaryOnly,
                takedownEmail: article.legal.takedownEmail,
              },
            }),
          ),
        ),
      undefined,
    );
  }

  async createRunLog(input: RunLogInput) {
    if (!(await this.prisma.ensureAvailable())) {
      return null;
    }

    const client = this.prisma.getClient();
    if (!client) {
      return null;
    }

    return this.safely(
      () =>
        client.newsPipelineRun.create({
          data: {
            stage: input.stage,
            status: input.status,
            trigger: input.trigger,
            message: input.message,
            articleCount: input.articleCount ?? 0,
            feedCount: input.feedCount ?? 0,
            metadata: this.toJsonValue(input.metadata),
          },
        }),
      null,
    );
  }

  async finishRunLog(runId: string, input: Omit<RunLogInput, 'trigger'>) {
    if (!(await this.prisma.ensureAvailable()) || !runId) {
      return null;
    }

    const client = this.prisma.getClient();
    if (!client) {
      return null;
    }

    return this.safely(
      () =>
        client.newsPipelineRun.update({
          where: { id: runId },
          data: {
            stage: input.stage,
            status: input.status,
            message: input.message,
            articleCount: input.articleCount ?? 0,
            feedCount: input.feedCount ?? 0,
            metadata: this.toJsonValue(input.metadata),
            finishedAt: new Date(),
          },
        }),
      null,
    );
  }

  async getRecentRuns(limit: number) {
    if (!(await this.prisma.ensureAvailable())) {
      return [];
    }

    return this.safely(
      () =>
        this.prisma.getClient()!.newsPipelineRun.findMany({
          orderBy: { createdAt: 'desc' },
          take: limit,
        }),
      [],
    );
  }

  async getConfiguredSources() {
    if (!(await this.prisma.ensureAvailable())) {
      return [];
    }

    return this.safely(
      () =>
        this.prisma.getClient()!.newsSource.findMany({
          where: { isActive: true },
          orderBy: { name: 'asc' },
        }),
      [],
    );
  }

  mapStoredArticle(article: AiArticle): ProcessedArticle {
    return {
      id: article.id,
      rawArticleId: article.rawArticleId,
      slug: article.slug,
      sourceName: article.sourceName,
      sourceUrl: article.sourceUrl,
      title: article.title,
      excerpt: article.summary,
      summary: article.summary,
      keyPoints: Array.isArray(article.keyPoints) ? (article.keyPoints as string[]) : [],
      category: article.category,
      imageUrl: article.imageUrl,
      publishedAt: article.publishedAt.toISOString(),
      processedAt: article.processedAt.toISOString(),
      legal: {
        attributionRequired: true,
        copyrightOwner: article.copyrightOwner,
        summaryOnly: true,
        takedownEmail: article.takedownEmail,
      },
    };
  }

  mapRun(run: NewsPipelineRun) {
    return {
      id: run.id,
      stage: run.stage,
      status: run.status,
      trigger: run.trigger,
      message: run.message,
      articleCount: run.articleCount,
      feedCount: run.feedCount,
      metadata: run.metadata,
      startedAt: run.startedAt.toISOString(),
      finishedAt: run.finishedAt?.toISOString() ?? null,
      createdAt: run.createdAt.toISOString(),
    };
  }

  mapSource(source: NewsSource) {
    return {
      id: source.id,
      name: source.name,
      type: source.type,
      baseUrl: source.baseUrl,
      pollIntervalMinutes: source.pollIntervalMinutes,
      isActive: source.isActive,
    };
  }

  private mapRawArticle(article: RawArticle, source: NewsSource): RawStoredArticle {
    return {
      id: article.id,
      sourceId: article.sourceId,
      externalId: article.externalId ?? undefined,
      title: article.title,
      url: article.url,
      content: article.content,
      excerpt: article.excerpt,
      author: article.author ?? undefined,
      publishedAt: article.publishedAt.toISOString(),
      fetchedAt: article.fetchedAt.toISOString(),
      contentHash: article.contentHash,
      status: article.status,
      category: article.category ?? undefined,
      imageUrl: article.imageUrl ?? undefined,
      isDuplicate: article.isDuplicate,
      duplicateOfId: article.duplicateOfId ?? undefined,
      sourceName: source.name,
      sourceUrl: article.url,
    };
  }
}
