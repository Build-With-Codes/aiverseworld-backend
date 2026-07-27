import {
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { BookRecommendation, PageBook, Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';

type ContextType = 'tool' | 'blog';

const BOOK_CACHE_TTL_DAYS = 180;
const GOOGLE_BOOKS_MAX_RESULTS = 20;
const MAX_BOOKS_TO_CACHE = 5;
const MIN_BOOK_SCORE = 35;
const REJECT_BOOK_PATTERNS = [
  /\bfor kids\b/i,
  /\bchildren\b/i,
  /\bjuvenile\b/i,
  /\bnovel\b/i,
  /\bfiction\b/i,
  /\bcoloring\b/i,
  /\bactivity book\b/i,
  /\bjoke\b/i,
];
const TECH_BOOK_CATEGORY_PATTERNS = [
  /\bcomputers?\b/i,
  /\bprogramming\b/i,
  /\bartificial intelligence\b/i,
  /\btechnology\b/i,
  /\bengineering\b/i,
  /\bbusiness\b/i,
  /\bdata\b/i,
];
const QUERY_STOP_WORDS = new Set([
  'about',
  'after',
  'also',
  'best',
  'book',
  'books',
  'from',
  'guide',
  'into',
  'learn',
  'learning',
  'more',
  'overview',
  'review',
  'that',
  'this',
  'tool',
  'tools',
  'using',
  'with',
  'your',
]);

type RecommendationContext = {
  contextType: ContextType;
  contextKey: string;
  title: string;
  category: string;
  tags: string[];
  text: string;
  toolName?: string;
};

type GoogleBooksResponse = {
  items?: Array<{
    id?: string;
    volumeInfo?: {
      title?: string;
      subtitle?: string;
      authors?: string[];
      description?: string;
      imageLinks?: {
        thumbnail?: string;
        smallThumbnail?: string;
      };
      averageRating?: number;
      ratingsCount?: number;
      previewLink?: string;
      infoLink?: string;
      publishedDate?: string;
      categories?: string[];
      industryIdentifiers?: Array<{
        type?: string;
        identifier?: string;
      }>;
    };
  }>;
};

type GoogleBookCandidate = {
  googleBookId: string;
  title: string;
  subtitle: string | null;
  authors: string[];
  description: string | null;
  thumbnailUrl: string | null;
  averageRating: number | null;
  ratingsCount: number | null;
  previewLink: string | null;
  infoLink: string;
  publishedDate: string | null;
  categories: string[];
  isbn13: string | null;
  query: string;
  queryPriority: number;
};

type SeedBook = {
  slug: string;
  title: string;
  subtitle?: string;
  author: string;
  description: string;
  isbn13?: string;
  coverUrl?: string;
  buyUrl: string;
  merchant: string;
  categories: string[];
  tags: string[];
  keywords: string[];
  priority: number;
};

const DEFAULT_BOOKS: SeedBook[] = [
  {
    slug: 'co-intelligence',
    title: 'Co-Intelligence',
    subtitle: 'Living and Working with AI',
    author: 'Ethan Mollick',
    description:
      'A practical book for understanding how to collaborate with generative AI across work, learning, creativity, and decision-making.',
    buyUrl:
      'https://www.penguinrandomhouse.com/books/741805/co-intelligence-by-ethan-mollick/',
    merchant: 'Publisher',
    categories: ['AI Assistant', 'Productivity', 'Business'],
    tags: ['ai', 'generative ai', 'chatgpt', 'productivity', 'workflows'],
    keywords: ['assistant', 'prompt', 'automation', 'business', 'creator'],
    priority: 95,
  },
  {
    slug: 'prompt-engineering-for-generative-ai',
    title: 'Prompt Engineering for Generative AI',
    author: 'James Phoenix and Mike Taylor',
    description:
      'A hands-on guide to better prompts, reusable prompt patterns, AI writing workflows, and practical generative AI use cases.',
    buyUrl:
      'https://www.oreilly.com/library/view/prompt-engineering-for/9781098153427/',
    merchant: 'OReilly',
    categories: [
      'AI Assistant',
      'Writing Assistant',
      'Marketing',
      'Productivity',
    ],
    tags: ['prompt engineering', 'generative ai', 'writing', 'marketing'],
    keywords: ['prompt', 'copywriting', 'content', 'chatgpt', 'workflow'],
    priority: 90,
  },
  {
    slug: 'designing-machine-learning-systems',
    title: 'Designing Machine Learning Systems',
    author: 'Chip Huyen',
    description:
      'A production-focused guide to designing, deploying, monitoring, and maintaining machine learning systems at scale.',
    buyUrl:
      'https://www.oreilly.com/library/view/designing-machine-learning-systems/9781098107956/',
    merchant: 'OReilly',
    categories: [
      'Machine Learning',
      'Data',
      'Developer Tools',
      'AI Infrastructure',
    ],
    tags: ['mlops', 'machine learning', 'data', 'deployment', 'monitoring'],
    keywords: [
      'model',
      'pipeline',
      'production',
      'evaluation',
      'infrastructure',
    ],
    priority: 88,
  },
  {
    slug: 'hands-on-machine-learning',
    title: 'Hands-On Machine Learning with Scikit-Learn, Keras, and TensorFlow',
    author: 'Aurelien Geron',
    description:
      'A practical machine learning reference for developers who want to build and understand real ML models and workflows.',
    buyUrl:
      'https://www.oreilly.com/library/view/hands-on-machine-learning/9781098125967/',
    merchant: 'OReilly',
    categories: ['Machine Learning', 'Data', 'Developer Tools'],
    tags: ['python', 'machine learning', 'tensorflow', 'keras', 'scikit-learn'],
    keywords: ['model', 'training', 'python', 'data science', 'ml'],
    priority: 82,
  },
];

function asStringArray(value: Prisma.JsonValue | null): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function normalizeTokens(values: string[]) {
  return values
    .flatMap((value) => value.toLowerCase().split(/[^a-z0-9]+/g))
    .filter((token) => token.length >= 3);
}

function stripHtml(value: string) {
  return value.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function uniqueStrings(values: string[]) {
  return Array.from(
    new Set(values.map((value) => value.trim()).filter(Boolean)),
  );
}

@Injectable()
export class BooksService {
  private readonly logger = new Logger(BooksService.name);
  private seeded = false;

  constructor(private readonly prismaService: PrismaService) {}

  async getRecommendations(input: {
    type: ContextType;
    key: string;
    limit: number;
  }) {
    const prisma = this.prismaService.getClient();
    if (!prisma || !(await this.prismaService.ensureAvailable())) {
      throw new ServiceUnavailableException(
        'Book recommendations are unavailable.',
      );
    }

    await this.ensureBookCatalogShape(prisma);
    await this.ensureDefaultBooks(prisma);

    const context =
      input.type === 'tool'
        ? await this.getToolContext(prisma, input.key)
        : await this.getBlogContext(prisma, input.key);

    const limit = Math.min(
      Math.max(Number.isFinite(input.limit) ? input.limit : 4, 1),
      MAX_BOOKS_TO_CACHE,
    );
    const cached = await this.getFreshCachedBooks(prisma, context, limit);
    if (cached.length > 0) {
      return this.buildPageBookResponse(cached, context, 'cache');
    }

    const queries = await this.generateSearchQueries(context);
    const discovered = await this.discoverGoogleBooks(context, queries);
    if (discovered.length > 0) {
      await prisma.$transaction([
        prisma.pageBook.deleteMany({
          where: {
            contextType: context.contextType,
            contextKey: context.contextKey,
          },
        }),
        ...discovered.slice(0, MAX_BOOKS_TO_CACHE).map((book) =>
          prisma.pageBook.create({
            data: {
              contextType: context.contextType,
              contextKey: context.contextKey,
              googleBookId: book.googleBookId,
              isbn13: book.isbn13,
              title: book.title,
              subtitle: book.subtitle,
              authors: book.authors,
              description: book.description,
              thumbnailUrl: book.thumbnailUrl,
              averageRating: book.averageRating,
              ratingsCount: book.ratingsCount,
              previewLink: book.previewLink,
              infoLink: book.infoLink,
              publishedDate: book.publishedDate,
              categories: book.categories,
              score: book.score,
              reason: book.reason,
              searchQueries: queries,
            },
          }),
        ),
      ]);

      const saved = await this.getFreshCachedBooks(prisma, context, limit);
      return this.buildPageBookResponse(saved, context, 'google-books');
    }

    const fallback = await this.getCuratedFallback(prisma, context, limit);
    return this.buildCuratedResponse(fallback, context);
  }

  private async getToolContext(
    prisma: NonNullable<ReturnType<PrismaService['getClient']>>,
    key: string,
  ): Promise<RecommendationContext> {
    const slug = key.toLowerCase();
    const tool = await prisma.aiTool.findFirst({
      where: { OR: [{ id: key }, { slug }] },
      select: {
        id: true,
        slug: true,
        name: true,
        category: true,
        subcategory: true,
        shortDescription: true,
        summary: true,
        features: true,
        bestFor: true,
        targetAudience: true,
        tags: true,
      },
    });

    if (!tool) {
      throw new NotFoundException('AI tool not found.');
    }

    const tags = [
      tool.category,
      tool.subcategory,
      ...asStringArray(tool.tags),
      ...asStringArray(tool.features),
      ...asStringArray(tool.bestFor),
      ...asStringArray(tool.targetAudience),
    ];

    return {
      contextType: 'tool',
      contextKey: tool.id,
      title: tool.name,
      toolName: tool.name,
      category: tool.category,
      tags,
      text: [
        tool.name,
        tool.category,
        tool.subcategory,
        tool.shortDescription,
        tool.summary ?? '',
        tags.join(' '),
      ].join(' '),
    };
  }

  private async getBlogContext(
    prisma: NonNullable<ReturnType<PrismaService['getClient']>>,
    slug: string,
  ): Promise<RecommendationContext> {
    const post = await prisma.blogPost.findFirst({
      where: { slug, published: true },
      select: {
        slug: true,
        title: true,
        description: true,
        content: true,
        category: true,
        tags: true,
      },
    });

    if (!post) {
      throw new NotFoundException('Blog post not found.');
    }

    const tags = [post.category, ...asStringArray(post.tags)];

    return {
      contextType: 'blog',
      contextKey: post.slug,
      title: post.title,
      category: post.category,
      tags,
      text: [post.title, post.description, stripHtml(post.content), tags.join(' ')].join(
        ' ',
      ),
    };
  }

  private async getFreshCachedBooks(
    prisma: NonNullable<ReturnType<PrismaService['getClient']>>,
    context: RecommendationContext,
    limit: number,
  ) {
    const staleBefore = new Date(
      Date.now() - BOOK_CACHE_TTL_DAYS * 24 * 60 * 60 * 1000,
    );

    return prisma.pageBook.findMany({
      where: {
        contextType: context.contextType,
        contextKey: context.contextKey,
        cachedAt: { gte: staleBefore },
      },
      orderBy: [{ score: 'desc' }, { cachedAt: 'desc' }],
      take: limit,
    });
  }

  private generateSearchQueries(context: RecommendationContext) {
    return this.generateFallbackQueries(context);
  }

  private generateFallbackQueries(context: RecommendationContext) {
    const topTags = context.tags.slice(0, 4);
    const keywords = this.extractSearchKeywords(context);
    if (context.contextType === 'tool' && context.toolName) {
      return uniqueStrings([
        `${context.toolName} ${keywords.slice(0, 2).join(' ')} book`,
        `${context.toolName} ${context.category} guide`,
        `${context.toolName} tutorial learning book`,
        `${context.category} practical guide`,
        `${keywords.slice(0, 3).join(' ')} book`,
      ]).filter((query) => query.split(/\s+/).length >= 2);
    }

    return uniqueStrings([
      `${context.title} practical book`,
      `${context.category} practical guide`,
      `${keywords.slice(0, 3).join(' ')} book`,
      `${topTags.slice(0, 2).join(' ')} learning book`,
      `${topTags[0] ?? context.category} learning book`,
    ]).filter((query) => query.split(/\s+/).length >= 2);
  }

  private extractSearchKeywords(context: RecommendationContext) {
    const preferred = normalizeTokens([
      context.title,
      context.category,
      ...context.tags.slice(0, 8),
    ]).filter((token) => !QUERY_STOP_WORDS.has(token));
    const fallback = normalizeTokens([context.text])
      .filter((token) => !QUERY_STOP_WORDS.has(token))
      .slice(0, 8);

    return uniqueStrings([...preferred, ...fallback]).slice(0, 6);
  }

  private async discoverGoogleBooks(
    context: RecommendationContext,
    queries: string[],
  ) {
    const byId = new Map<string, GoogleBookCandidate>();

    for (const [index, query] of queries.entries()) {
      const books = await this.fetchGoogleBooks(query, index);
      for (const book of books) {
        const existing = byId.get(book.googleBookId);
        if (!existing || book.queryPriority < existing.queryPriority) {
          byId.set(book.googleBookId, book);
        }
      }
    }

    return Array.from(byId.values())
      .map((book) => this.scoreGoogleBook(book, context))
      .filter((item) => item.score >= MIN_BOOK_SCORE)
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_BOOKS_TO_CACHE);
  }

  private async fetchGoogleBooks(query: string, queryPriority: number) {
    const url = new URL('https://www.googleapis.com/books/v1/volumes');
    url.searchParams.set('q', query);
    url.searchParams.set('maxResults', String(GOOGLE_BOOKS_MAX_RESULTS));
    url.searchParams.set('printType', 'books');
    url.searchParams.set('orderBy', 'relevance');
    const apiKey = process.env.GOOGLE_BOOKS_API_KEY?.trim();
    if (apiKey) {
      url.searchParams.set('key', apiKey);
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);

    try {
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) {
        throw new Error(`Google Books returned ${response.status}`);
      }

      const payload = (await response.json()) as GoogleBooksResponse;
      return (payload.items ?? [])
        .map((item) => this.normalizeGoogleBook(item, query, queryPriority))
        .filter((book): book is GoogleBookCandidate => Boolean(book));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown error';
      this.logger.warn(`Google Books fetch failed for "${query}": ${message}`);
      return [];
    } finally {
      clearTimeout(timeout);
    }
  }

  private normalizeGoogleBook(
    item: NonNullable<GoogleBooksResponse['items']>[number],
    query: string,
    queryPriority: number,
  ): GoogleBookCandidate | null {
    const info = item.volumeInfo;
    if (!item.id || !info?.title || !info.infoLink) {
      return null;
    }

    const isbn13 =
      info.industryIdentifiers?.find((id) => id.type === 'ISBN_13')?.identifier ??
      null;

    return {
      googleBookId: item.id,
      title: info.title.trim(),
      subtitle: info.subtitle?.trim() || null,
      authors: info.authors ?? [],
      description: info.description ? stripHtml(info.description).slice(0, 800) : null,
      thumbnailUrl: this.upgradeGoogleCoverUrl(
        info.imageLinks?.thumbnail ?? info.imageLinks?.smallThumbnail,
      ),
      averageRating: info.averageRating ?? null,
      ratingsCount: info.ratingsCount ?? null,
      previewLink: info.previewLink ?? null,
      infoLink: info.infoLink,
      publishedDate: info.publishedDate ?? null,
      categories: info.categories ?? [],
      isbn13,
      query,
      queryPriority,
    };
  }

  private scoreGoogleBook(book: GoogleBookCandidate, context: RecommendationContext) {
    const title = book.title.toLowerCase();
    const subtitle = (book.subtitle ?? '').toLowerCase();
    const description = (book.description ?? '').toLowerCase();
    const categories = book.categories.join(' ').toLowerCase();
    const contextTokens = new Set(normalizeTokens([context.text, ...context.tags]));
    const toolName = context.toolName?.toLowerCase();

    if (REJECT_BOOK_PATTERNS.some((pattern) => pattern.test(`${title} ${subtitle} ${categories}`))) {
      return { ...book, score: 0, reason: 'Rejected as non-learning content.' };
    }

    let score = Math.max(0, 12 - book.queryPriority * 2);
    let reason = `Matched to ${context.category} learning topics.`;

    if (toolName && title.includes(toolName)) {
      score += 50;
      reason = `Title directly references ${context.toolName}.`;
    }
    if (toolName && subtitle.includes(toolName)) score += 30;
    if (toolName && description.includes(toolName)) score += 20;

    const categoryMatch = TECH_BOOK_CATEGORY_PATTERNS.some((pattern) =>
      pattern.test(categories),
    );
    if (categoryMatch) score += 15;

    if ((book.averageRating ?? 0) >= 4.5) score += 20;
    if ((book.ratingsCount ?? 0) > 100) score += 20;
    if (this.isPublishedWithinYears(book.publishedDate, 3)) score += 10;

    const searchable = `${title} ${subtitle} ${description} ${categories}`;
    const matchedTags = normalizeTokens(context.tags).filter((token) =>
      searchable.includes(token),
    );
    score += Math.min(matchedTags.length, 6) * 5;
    if (!toolName && matchedTags[0]) {
      reason = `Relevant because it covers ${matchedTags[0]}.`;
    }

    const keywordHits = normalizeTokens([book.query, book.title, book.subtitle ?? '']).filter(
      (token) => contextTokens.has(token),
    );
    score += Math.min(keywordHits.length, 5) * 4;

    const relevant =
      categoryMatch ||
      (toolName && (title.includes(toolName) || description.includes(toolName))) ||
      matchedTags.length > 0;

    return {
      ...book,
      score: relevant ? Math.round(score) : 0,
      reason,
    };
  }

  private upgradeGoogleCoverUrl(value?: string) {
    if (!value) {
      return null;
    }

    return value.replace(/^http:/, 'https:').replace(/([?&]zoom=)(\d+)/, '$10');
  }

  private isPublishedWithinYears(value: string | null, years: number) {
    if (!value) return false;
    const year = Number(value.slice(0, 4));
    if (!Number.isFinite(year)) return false;
    return new Date().getUTCFullYear() - year <= years;
  }

  private buildPageBookResponse(
    books: PageBook[],
    context: RecommendationContext,
    source: string,
  ) {
    return {
      data: books.map((book) => ({
        id: book.id,
        slug: book.googleBookId,
        title: book.title,
        subtitle: book.subtitle,
        author: asStringArray(book.authors).join(', ') || 'Unknown author',
        description: book.description ?? '',
        isbn13: book.isbn13,
        coverUrl: book.thumbnailUrl,
        buyUrl: book.infoLink,
        previewLink: book.previewLink,
        merchant: 'Google Books',
        affiliateEnabled: false,
        averageRating: book.averageRating,
        ratingsCount: book.ratingsCount,
        publishedDate: book.publishedDate,
        score: book.score,
        reason: book.reason,
      })),
      meta: {
        type: context.contextType,
        key: context.contextKey,
        source,
        cacheTtlDays: BOOK_CACHE_TTL_DAYS,
        contextTitle: context.title,
      },
    };
  }

  private async getCuratedFallback(
    prisma: NonNullable<ReturnType<PrismaService['getClient']>>,
    context: RecommendationContext,
    limit: number,
  ) {
    const books = await prisma.bookRecommendation.findMany({
      where: { isActive: true },
      orderBy: [{ priority: 'desc' }, { updatedAt: 'desc' }],
      take: 100,
    });

    return books
      .map((book) => this.scoreCuratedBook(book, context))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score || b.book.priority - a.book.priority)
      .slice(0, limit);
  }

  private scoreCuratedBook(book: BookRecommendation, context: RecommendationContext) {
    const categories = asStringArray(book.categories);
    const tags = asStringArray(book.tags);
    const keywords = asStringArray(book.keywords);
    const contextTokens = new Set(normalizeTokens([context.text, ...context.tags]));

    let score = book.priority / 10;
    let reason = `Good fit for ${context.category} readers.`;

    if (categories.some((category) => category.toLowerCase() === context.category.toLowerCase())) {
      score += 18;
      reason = `Matches the ${context.category} focus of this page.`;
    }

    const tagOverlap = tags.filter((tag) =>
      context.tags.some((contextTag) => contextTag.toLowerCase() === tag.toLowerCase()),
    );
    score += tagOverlap.length * 8;
    if (tagOverlap[0]) reason = `Relevant because this page covers ${tagOverlap[0]}.`;

    const keywordOverlap = keywords.filter((keyword) =>
      normalizeTokens([keyword]).some((token) => contextTokens.has(token)),
    );
    score += Math.min(keywordOverlap.length, 6) * 4;

    return { book, score: Math.round(score), reason };
  }

  private buildCuratedResponse(
    scored: Array<{ book: BookRecommendation; reason: string; score: number }>,
    context: RecommendationContext,
  ) {
    return {
      data: scored.map(({ book, reason, score }) => ({
        id: book.id,
        slug: book.slug,
        title: book.title,
        subtitle: book.subtitle,
        author: book.author,
        description: book.description,
        isbn13: book.isbn13,
        coverUrl: book.coverUrl,
        buyUrl: book.affiliateEnabled && book.affiliateUrl ? book.affiliateUrl : book.buyUrl,
        merchant: book.merchant,
        affiliateEnabled: book.affiliateEnabled,
        score,
        reason,
      })),
      meta: {
        type: context.contextType,
        key: context.contextKey,
        source: 'curated-fallback',
        cacheTtlDays: BOOK_CACHE_TTL_DAYS,
        contextTitle: context.title,
      },
    };
  }

  private async ensureBookCatalogShape(
    prisma: NonNullable<ReturnType<PrismaService['getClient']>>,
  ) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "aiverse_world"."BookRecommendation" (
        "id" TEXT NOT NULL,
        "slug" TEXT NOT NULL,
        "title" TEXT NOT NULL,
        "subtitle" TEXT,
        "author" TEXT NOT NULL,
        "description" TEXT NOT NULL,
        "isbn13" TEXT,
        "coverUrl" TEXT,
        "buyUrl" TEXT NOT NULL,
        "merchant" TEXT NOT NULL DEFAULT 'Direct',
        "categories" JSONB NOT NULL,
        "tags" JSONB NOT NULL,
        "keywords" JSONB NOT NULL,
        "priority" INTEGER NOT NULL DEFAULT 0,
        "affiliateUrl" TEXT,
        "affiliateEnabled" BOOLEAN NOT NULL DEFAULT false,
        "isActive" BOOLEAN NOT NULL DEFAULT true,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL,
        CONSTRAINT "BookRecommendation_pkey" PRIMARY KEY ("id")
      )
    `);
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "aiverse_world"."PageBook" (
        "id" TEXT NOT NULL,
        "contextType" TEXT NOT NULL,
        "contextKey" TEXT NOT NULL,
        "googleBookId" TEXT NOT NULL,
        "isbn13" TEXT,
        "title" TEXT NOT NULL,
        "subtitle" TEXT,
        "authors" JSONB NOT NULL,
        "description" TEXT,
        "thumbnailUrl" TEXT,
        "averageRating" DOUBLE PRECISION,
        "ratingsCount" INTEGER,
        "previewLink" TEXT,
        "infoLink" TEXT NOT NULL,
        "publishedDate" TEXT,
        "categories" JSONB NOT NULL,
        "score" INTEGER NOT NULL DEFAULT 0,
        "reason" TEXT NOT NULL,
        "searchQueries" JSONB NOT NULL,
        "cachedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL,
        CONSTRAINT "PageBook_pkey" PRIMARY KEY ("id")
      )
    `);
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "aiverse_world"."PageBook"
      ADD COLUMN IF NOT EXISTS "isbn13" TEXT
    `);
    await prisma.$executeRawUnsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS "BookRecommendation_slug_key"
      ON "aiverse_world"."BookRecommendation"("slug")
    `);
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "BookRecommendation_isActive_priority_idx"
      ON "aiverse_world"."BookRecommendation"("isActive", "priority")
    `);
    await prisma.$executeRawUnsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS "PageBook_contextType_contextKey_googleBookId_key"
      ON "aiverse_world"."PageBook"("contextType", "contextKey", "googleBookId")
    `);
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "PageBook_contextType_contextKey_cachedAt_idx"
      ON "aiverse_world"."PageBook"("contextType", "contextKey", "cachedAt")
    `);
  }

  private async ensureDefaultBooks(
    prisma: NonNullable<ReturnType<PrismaService['getClient']>>,
  ) {
    if (this.seeded) return;

    const count = await prisma.bookRecommendation.count();
    if (count > 0) {
      this.seeded = true;
      return;
    }

    await prisma.bookRecommendation.createMany({
      data: DEFAULT_BOOKS.map((book) => ({
        ...book,
        categories: book.categories,
        tags: book.tags,
        keywords: book.keywords,
      })),
      skipDuplicates: true,
    });
    this.seeded = true;
  }
}
