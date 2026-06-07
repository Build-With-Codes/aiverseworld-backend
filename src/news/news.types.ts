export type NewsSourceArticle = {
  id: string;
  externalId?: string;
  sourceName: string;
  sourceType: string;
  sourceBaseUrl: string;
  sourceUrl: string;
  title: string;
  excerpt: string;
  body: string;
  category: string;
  imageUrl: string;
  author?: string;
  publishedAt: string;
};

export type ProcessedArticle = {
  id: string;
  rawArticleId: string;
  slug: string;
  sourceName: string;
  sourceUrl: string;
  title: string;
  excerpt: string;
  summary: string;
  keyPoints: string[];
  category: string;
  imageUrl: string;
  publishedAt: string;
  processedAt: string;
  legal: {
    attributionRequired: true;
    copyrightOwner: string;
    summaryOnly: true;
    takedownEmail: string;
  };
};

export type SourceRegistryItem = {
  name: string;
  type: string;
  baseUrl: string;
  pollIntervalMinutes: number;
};

export type RawStoredArticle = {
  id: string;
  sourceId: string;
  externalId?: string;
  title: string;
  url: string;
  content: string;
  excerpt: string;
  author?: string;
  publishedAt: string;
  fetchedAt: string;
  contentHash: string;
  status: string;
  category?: string;
  imageUrl?: string;
  isDuplicate: boolean;
  duplicateOfId?: string;
  sourceName: string;
  sourceUrl: string;
};

export type RefreshNewsOptions = {
  limit?: number;
  category?: string;
  trigger?: 'startup' | 'manual' | 'ingest' | 'scheduled' | 'cron';
};
