import { NewsCollectorService } from './news-collector.service';
import { PrismaService } from '../database/prisma.service';
import { NewsRepository } from './news.repository';
import { NewsService } from './news.service';

describe('NewsService', () => {
  let newsService: NewsService;
  let collector: jest.Mocked<NewsCollectorService>;
  let repository: jest.Mocked<NewsRepository>;
  let prismaService: jest.Mocked<PrismaService>;

  beforeEach(() => {
    delete process.env.OPENROUTER_API_KEY;
    collector = {
      collect: jest.fn().mockResolvedValue([]),
    } as unknown as jest.Mocked<NewsCollectorService>;
    repository = {
      isEnabled: jest.fn().mockReturnValue(false),
      getLatestArticles: jest.fn().mockResolvedValue([]),
      syncSources: jest.fn().mockResolvedValue(new Map()),
      stageRawArticles: jest.fn().mockResolvedValue([]),
      publishArticles: jest.fn().mockResolvedValue(undefined),
      createRunLog: jest.fn().mockResolvedValue(null),
      finishRunLog: jest.fn().mockResolvedValue(null),
      getRecentRuns: jest.fn().mockResolvedValue([]),
      getConfiguredSources: jest.fn().mockResolvedValue([]),
      mapStoredArticle: jest.fn(),
      mapRun: jest.fn(),
      mapSource: jest.fn(),
    } as unknown as jest.Mocked<NewsRepository>;
    prismaService = {
      getStatus: jest.fn().mockReturnValue({
        configured: false,
        connected: false,
        lastError: null,
      }),
    } as unknown as jest.Mocked<PrismaService>;
    newsService = new NewsService(prismaService, collector, repository);
  });

  it('returns processed articles with legal metadata', async () => {
    const articles = await newsService.getArticles({ limit: 2 });

    expect(articles).toHaveLength(2);
    expect(articles[0]).toMatchObject({
      legal: {
        attributionRequired: true,
        summaryOnly: true,
      },
    });
    expect(articles[0].keyPoints).toHaveLength(3);
  });

  it('ingests a new article and surfaces it first', async () => {
    const article = await newsService.ingestArticle({
      id: 'new-enterprise-ai-policy',
      sourceName: 'Enterprise Wire',
      sourceType: 'BLOG',
      sourceBaseUrl: 'https://example.com',
      sourceUrl: 'https://example.com/enterprise-wire/new-enterprise-ai-policy',
      title: 'Procurement teams add model-risk reviews to AI purchasing',
      excerpt: 'Procurement now works with security and legal teams earlier in AI vendor selection.',
      body: 'Procurement teams are becoming more active in AI buying decisions. They want documentation around data handling, fallback behavior, and vendor transparency before approval.',
      category: 'Legal',
      imageUrl: 'https://example.com/image.jpg',
      publishedAt: '2026-06-06T07:30:00.000Z',
    });

    const articles = await newsService.getArticles({ limit: 1 });

    expect(article.id).toBe('new-enterprise-ai-policy');
    expect(articles[0].id).toBe('new-enterprise-ai-policy');
  });

  it('uses remote feed articles when collection succeeds', async () => {
    collector.collect.mockResolvedValue([
      {
        id: 'remote-1',
        sourceName: 'TechCrunch',
        sourceType: 'RSS',
        sourceBaseUrl: 'https://techcrunch.com',
        sourceUrl: 'https://techcrunch.com/example-story',
        title: 'OpenAI launches a new enterprise admin control layer',
        excerpt: 'A new admin layer focuses on governance and workflow controls.',
        body: 'A new admin layer focuses on governance and workflow controls for enterprise deployments.',
        category: 'Governance',
        imageUrl: 'https://images.unsplash.com/photo-1',
        publishedAt: '2026-06-06T10:00:00.000Z',
      },
    ]);

    const articles = await newsService.refreshArticles({ limit: 1 });

    expect(collector.collect).toHaveBeenCalledWith(1);
    expect(articles[0].sourceName).toBe('TechCrunch');
    expect(articles[0].rawArticleId).toBe('remote-1');
    expect(repository.publishArticles).toHaveBeenCalled();
  });
});
