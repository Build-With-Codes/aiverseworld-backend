import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { PrismaService } from '../database/prisma.service';
import { NewsCollectorService } from './news-collector.service';
import { seedArticles } from './news.seed';
import { getNewsFeedSources } from './news-sources';
import { NewsRepository } from './news.repository';
import type {
  NewsSourceArticle,
  ProcessedArticle,
  RawStoredArticle,
  RefreshNewsOptions,
} from './news.types';

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function splitSentences(value: string) {
  return value
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function hashContent(value: string) {
  return createHash('sha256').update(value.trim().toLowerCase()).digest('hex');
}

function resolveOpenRouterChatUrl() {
  const configuredUrl = process.env.OPENROUTER_BASE_URL?.trim();

  if (!configuredUrl) {
    return 'https://openrouter.ai/api/v1/chat/completions';
  }

  if (configuredUrl.endsWith('/chat/completions')) {
    return configuredUrl;
  }

  if (configuredUrl.endsWith('/api/v1')) {
    return `${configuredUrl}/chat/completions`;
  }

  if (configuredUrl.endsWith('/api/v1/')) {
    return `${configuredUrl}chat/completions`;
  }

  const normalizedBase = configuredUrl.replace(/\/+$/, '');

  if (normalizedBase.endsWith('/api')) {
    return `${normalizedBase}/v1/chat/completions`;
  }

  return `${normalizedBase}/api/v1/chat/completions`;
}

function getOpenRouterModels() {
  const configuredModel = process.env.OPENROUTER_MODEL?.trim();
  const fallbackModels = [
    '~google/gemini-flash-latest',
    'google/gemini-3.1-flash-lite',
    'google/gemini-3.5-flash',
  ];

  return Array.from(
    new Set(
      [configuredModel, ...fallbackModels].filter(
        (value): value is string => Boolean(value),
      ),
    ),
  );
}

function compareArticlesByFreshness(
  left: { processedAt?: string; publishedAt: string },
  right: { processedAt?: string; publishedAt: string },
) {
  const processedDifference = (right.processedAt ?? '').localeCompare(
    left.processedAt ?? '',
  );

  if (processedDifference !== 0) {
    return processedDifference;
  }

  return right.publishedAt.localeCompare(left.publishedAt);
}

@Injectable()
export class NewsService {
  private readonly logger = new Logger(NewsService.name);
  private readonly defaultArticleLimit = 10;
  private readonly minimumPublishedArticles = 10;
  private processedArticles: ProcessedArticle[] = [];
  private sourceArticles: NewsSourceArticle[] = [...seedArticles];

  constructor(
    private readonly prismaService: PrismaService,
    private readonly collector: NewsCollectorService,
    private readonly repository: NewsRepository,
  ) {}

  async getArticles(options: RefreshNewsOptions = {}) {
    const requestedLimit = options.limit ?? this.defaultArticleLimit;

    if (this.repository.isEnabled()) {
      const storedArticles = await this.repository.getLatestArticles(
        requestedLimit,
        options.category,
      );
      const publishedArticles = storedArticles.map((article) =>
        this.repository.mapStoredArticle(article),
      );

      if (
        publishedArticles.length >=
        Math.min(requestedLimit, this.minimumPublishedArticles)
      ) {
        return publishedArticles.slice(0, requestedLimit);
      }

      if (publishedArticles.length > 0) {
        this.processedArticles = publishedArticles;
      }
    }

    if (this.processedArticles.length === 0) {
      await this.refreshArticles({
        ...options,
        trigger: options.trigger ?? 'startup',
      });
    }

    if (this.repository.isEnabled()) {
      const storedArticles = await this.repository.getLatestArticles(
        requestedLimit,
        options.category,
      );

      if (storedArticles.length > 0) {
        return storedArticles
          .map((article) => this.repository.mapStoredArticle(article))
          .slice(0, requestedLimit);
      }
    }

    let articles = [...this.processedArticles];

    if (options.category) {
      const category = options.category.toLowerCase();
      articles = articles.filter(
        (article) => article.category.toLowerCase() === category,
      );
    }

    return articles.slice(0, requestedLimit);
  }

  async refreshArticles(options: RefreshNewsOptions = {}) {
    const trigger = options.trigger ?? 'manual';
    const triggerLabel = this.getTriggerLabel(trigger);
    const run = await this.repository.createRunLog({
      stage: 'collect',
      status: 'running',
      trigger,
      message: `${triggerLabel} refresh started`,
      articleCount: 0,
      feedCount: 0,
      metadata: { limit: options.limit ?? 20, category: options.category ?? null },
    });

    this.logger.log(`${triggerLabel} started`);

    const remoteArticles = await this.collector.collect(options.limit ?? 20);
    const fallbackArticles =
      remoteArticles.length > 0 ? [] : [...this.sourceArticles].slice(0, options.limit ?? 20);
    const candidateArticles = remoteArticles.length > 0 ? remoteArticles : fallbackArticles;

    this.sourceArticles = this.mergeArticles(candidateArticles, seedArticles);

    const sourceRegistry = getNewsFeedSources().map((source) => ({
      name: source.name,
      type: source.type,
      baseUrl: source.baseUrl,
      pollIntervalMinutes: source.pollIntervalMinutes,
    }));
    const sourceIds = await this.repository.syncSources(sourceRegistry);

    const stagedRawArticles = await this.repository.stageRawArticles(
      sourceIds,
      candidateArticles.map((article) => ({
        sourceName: article.sourceName,
        externalId: article.externalId,
        title: article.title,
        url: article.sourceUrl,
        content: article.body,
        excerpt: article.excerpt,
        author: article.author,
        publishedAt: article.publishedAt,
        category: article.category,
        imageUrl: article.imageUrl,
        contentHash: hashContent(`${article.title} ${article.body}`),
      })),
    );

    let rawArticles = this.repository.isEnabled()
      ? stagedRawArticles
      : candidateArticles.map((article) => this.mapToMemoryRaw(article));

    if (options.category) {
      const category = options.category.toLowerCase();
      rawArticles = rawArticles.filter(
        (article) => (article.category ?? '').toLowerCase() === category,
      );
    }

    if (options.limit) {
      rawArticles = rawArticles.slice(0, options.limit);
    }

    try {
      const uniqueRawArticles = rawArticles.filter((article) => !article.isDuplicate);
      const processed = await Promise.all(
        uniqueRawArticles.map((article) => this.processArticle(article)),
      );

      this.processedArticles = processed.sort(compareArticlesByFreshness);

      await this.repository.publishArticles(this.processedArticles);
      if (this.repository.isEnabled()) {
        const publishedArticles = await this.repository.getLatestArticles(
          options.limit ?? this.defaultArticleLimit,
          options.category,
        );

        if (publishedArticles.length > 0) {
          this.processedArticles = publishedArticles.map((article) =>
            this.repository.mapStoredArticle(article),
          );
        }
      }
      await this.repository.finishRunLog(run?.id ?? '', {
        stage: 'publish',
        status: 'completed',
        message: `${triggerLabel} completed`,
        articleCount: this.processedArticles.length,
        feedCount: candidateArticles.length,
        metadata: {
          rawArticles: rawArticles.length,
          uniqueArticles: uniqueRawArticles.length,
          publishedArticles: this.processedArticles.length,
          persistenceEnabled: this.repository.isEnabled(),
        },
      });

      this.logger.log(
        `${triggerLabel} completed. Raw=${rawArticles.length}, Unique=${uniqueRawArticles.length}, Published=${this.processedArticles.length}, Persistence=${this.repository.isEnabled()}`,
      );

      return this.processedArticles;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown refresh error';

      await this.repository.finishRunLog(run?.id ?? '', {
        stage: 'process',
        status: 'failed',
        message,
        articleCount: 0,
        feedCount: candidateArticles.length,
        metadata: {
          rawArticles: rawArticles.length,
        },
      });

      this.logger.error(`News refresh failed: ${message}`);
      throw error;
    }
  }

  async ingestArticle(article: NewsSourceArticle) {
    const rawArticle = this.mapToMemoryRaw(article);
    const processedArticle = await this.processArticle(rawArticle);

    this.processedArticles = [processedArticle, ...this.processedArticles].sort(
      compareArticlesByFreshness,
    );

    await this.repository.publishArticles([processedArticle]);
    await this.repository.createRunLog({
      stage: 'ingest',
      status: 'completed',
      trigger: 'ingest',
      message: `Article ingested: ${article.title}`,
      articleCount: 1,
      feedCount: 0,
      metadata: {
        articleId: article.id,
        sourceUrl: article.sourceUrl,
      },
    });

    this.logger.log(`Article ingested and published: ${article.title}`);
    return processedArticle;
  }

  async getSources() {
    const storedSources = await this.repository.getConfiguredSources();

    if (storedSources.length > 0) {
      return storedSources.map((source) => this.repository.mapSource(source));
    }

    return getNewsFeedSources().map((source) => ({
      id: source.name,
      name: source.name,
      type: source.type,
      baseUrl: source.baseUrl,
      pollIntervalMinutes: source.pollIntervalMinutes,
      isActive: true,
    }));
  }

  async getRecentRuns(limit = 20) {
    const runs = await this.repository.getRecentRuns(limit);
    return runs.map((run) => this.repository.mapRun(run));
  }

  getHealth() {
    const database = this.prismaService.getStatus();

    return {
      ok: true,
      articles: this.processedArticles.length || this.sourceArticles.length,
      openRouterConfigured: Boolean(process.env.OPENROUTER_API_KEY),
      persistenceEnabled: this.repository.isEnabled(),
      database,
      remoteFetchEnabled: process.env.NEWS_DISABLE_REMOTE_FETCH !== 'true',
      pipeline: ['sources', 'raw_articles', 'deduplication', 'ai_articles', 'api'],
      tables: ['news_sources', 'raw_articles', 'ai_articles', 'news_pipeline_run'],
    };
  }

  private async processArticle(article: RawStoredArticle): Promise<ProcessedArticle> {
    const aiSummary = await this.generateSummary(article);
    const processedAt = new Date().toISOString();

    return {
      id: article.id,
      rawArticleId: article.id,
      slug: slugify(aiSummary.title),
      sourceName: article.sourceName,
      sourceUrl: article.url,
      title: aiSummary.title,
      excerpt: article.excerpt,
      summary: aiSummary.summary,
      keyPoints: aiSummary.keyPoints,
      category: article.category ?? 'AI',
      imageUrl: article.imageUrl ?? 'https://images.unsplash.com/photo-1495020689067-958852a7765e?auto=format&fit=crop&w=1200&q=80',
      publishedAt: article.publishedAt,
      processedAt,
      legal: {
        attributionRequired: true,
        copyrightOwner: article.sourceName,
        summaryOnly: true,
        takedownEmail: process.env.NEWS_TAKEDOWN_EMAIL ?? 'legal@aiverseworld.example',
      },
    };
  }

  private async generateSummary(article: RawStoredArticle) {
    if (!process.env.OPENROUTER_API_KEY) {
      this.logger.warn(
        `Fallback summary used for "${article.title}" because OPENROUTER_API_KEY is not configured.`,
      );
      return this.generateFallbackSummary(article.content, article.excerpt, article.title, article.category);
    }

    const openRouterUrl = resolveOpenRouterChatUrl();

    for (const model of getOpenRouterModels()) {
      try {
        const response = await fetch(openRouterUrl, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
            'Content-Type': 'application/json',
            'HTTP-Referer':
              process.env.OPENROUTER_SITE_URL ?? 'https://aiverseworld.example',
            'X-Title': process.env.OPENROUTER_APP_NAME ?? 'AiverseWorld News',
          },
          body: JSON.stringify({
            model,
            temperature: 0.2,
            response_format: { type: 'json_object' },
            messages: [
              {
                role: 'system',
                content:
                  'You summarize enterprise AI news. Return JSON with title and summary. The title should be a clean short headline. The summary should be one short factual paragraph, with no quotes, within about 4 short lines.',
              },
              {
                role: 'user',
                content: JSON.stringify({
                  title: article.title,
                  sourceName: article.sourceName,
                  excerpt: article.excerpt,
                  body: article.content,
                  rules: [
                    'Write a short clean headline.',
                    'Write one short paragraph only.',
                    'Keep it under 70 words.',
                    'Do not quote the article.',
                    'Do not add unsupported claims.',
                  ],
                }),
              },
            ],
          }),
        });

        if (!response.ok) {
          this.logger.warn(
            `OpenRouter returned HTTP ${response.status} for "${article.title}" with model=${model}. Trying next model if available.`,
          );
          continue;
        }

        const payload = (await response.json()) as {
          choices?: Array<{ message?: { content?: string } }>;
        };
        const content = payload.choices?.[0]?.message?.content;

        if (!content) {
          this.logger.warn(
            `OpenRouter returned no content for "${article.title}" with model=${model}. Trying next model if available.`,
          );
          continue;
        }

        const parsed = JSON.parse(content) as {
          title?: string;
          summary?: string;
        };

        if (!parsed.title || !parsed.summary) {
          this.logger.warn(
            `OpenRouter returned invalid JSON fields for "${article.title}" with model=${model}. Trying next model if available.`,
          );
          continue;
        }

        this.logger.log(
          `OpenRouter summary generated for "${article.title}" with model=${model}`,
        );
        return {
          title: parsed.title.trim(),
          summary: parsed.summary.trim(),
          keyPoints: [],
        };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Unknown OpenRouter error';
        this.logger.warn(
          `OpenRouter failed for "${article.title}" with model=${model}: ${message}. Trying next model if available.`,
        );
      }
    }

    this.logger.warn(
      `Fallback summary used for "${article.title}" because all OpenRouter model attempts failed.`,
    );
    return this.generateFallbackSummary(
      article.content,
      article.excerpt,
      article.title,
      article.category,
    );
  }

  private generateFallbackSummary(
    content: string,
    excerpt: string,
    title: string,
    category?: string,
  ) {
    const sentences = splitSentences(content);
    const summary = sentences
      .slice(0, 2)
      .join(' ')
      .trim()
      .slice(0, 420);

    return {
      title: title.trim(),
      summary:
        summary || excerpt.trim() || `${title}. Category focus: ${category ?? 'AI'}.`,
      keyPoints: [],
    };
  }

  private mergeArticles(
    primaryArticles: NewsSourceArticle[],
    fallbackArticles: NewsSourceArticle[],
  ) {
    const deduped = new Map<string, NewsSourceArticle>();

    for (const article of [...primaryArticles, ...fallbackArticles]) {
      const key = article.sourceUrl || article.id;
      if (!deduped.has(key)) {
        deduped.set(key, article);
      }
    }

    return Array.from(deduped.values());
  }

  private mapToMemoryRaw(article: NewsSourceArticle): RawStoredArticle {
    return {
      id: article.id,
      sourceId: article.sourceName,
      externalId: article.externalId,
      title: article.title,
      url: article.sourceUrl,
      content: article.body,
      excerpt: article.excerpt,
      author: article.author,
      publishedAt: article.publishedAt,
      fetchedAt: new Date().toISOString(),
      contentHash: hashContent(`${article.title} ${article.body}`),
      status: 'fetched',
      category: article.category,
      imageUrl: article.imageUrl,
      isDuplicate: false,
      duplicateOfId: undefined,
      sourceName: article.sourceName,
      sourceUrl: article.sourceUrl,
    };
  }

  private getTriggerLabel(trigger: RefreshNewsOptions['trigger']) {
    switch (trigger) {
      case 'cron':
        return 'Cron job refresh';
      case 'scheduled':
        return 'Scheduled refresh';
      case 'startup':
        return 'Startup refresh';
      case 'ingest':
        return 'Ingest refresh';
      default:
        return 'Manual refresh';
    }
  }
}
