import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { Document } from '@langchain/core/documents';
import type { EmbeddingsInterface } from '@langchain/core/embeddings';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import { Pinecone, type Index, type RecordMetadata } from '@pinecone-database/pinecone';
import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { CloudflareAiService } from './cloudflare-ai.service';
import { LangfuseTracingService } from './langfuse-tracing.service';
import { LocalHashEmbeddings } from './local-hash-embeddings';
import type { RagToolRecord } from './tool-rag.types';

function asStringArray(value: Prisma.JsonValue | null | undefined): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function contentHash(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

const STOP_WORDS = new Set([
  'ai',
  'tool',
  'tools',
  'for',
  'the',
  'and',
  'with',
  'that',
  'this',
  'need',
  'want',
  'best',
  'use',
  'wan',
]);

function normalizeQueryText(value: string) {
  return value
    .toLowerCase()
    .replace(/\bvidoe\b/g, 'video')
    .replace(/\bgeneratoe\b/g, 'generator')
    .replace(/\bgenerater\b/g, 'generator')
    .replace(/\bgnerator\b/g, 'generator');
}

function tokenizeIntent(value: string) {
  return normalizeQueryText(value)
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 2 && !STOP_WORDS.has(token));
}

function keywordScore(query: string, content: string) {
  const contentLower = content.toLowerCase();
  const tokens = tokenizeIntent(query);

  return tokens.reduce((score, token) => {
    if (contentLower.includes(token)) {
      return score + 0.18;
    }

    return score;
  }, 0);
}

function metadataString(metadata: RecordMetadata | undefined, key: string) {
  const value = metadata?.[key];
  return typeof value === 'string' ? value : '';
}

function metadataNumber(metadata: RecordMetadata | undefined, key: string) {
  const value = metadata?.[key];
  return typeof value === 'number' ? value : 0;
}

function truncate(value: string, length = 260) {
  return value.length > length ? `${value.slice(0, length)}...` : value;
}

export type ToolMetadataFilters = {
  category?: string;
  subcategory?: string;
  freeOnly?: boolean;
  apiOnly?: boolean;
  openSourceOnly?: boolean;
  pricing?: string;
  platform?: string;
};

type RetrievedToolChunk = {
  row: {
    toolId: string;
    content: string;
  };
  similarity: number;
  source: 'semantic' | 'keyword' | 'hybrid';
};

@Injectable()
export class ToolRagIndexService {
  private readonly logger = new Logger(ToolRagIndexService.name);
  private readonly splitter = new RecursiveCharacterTextSplitter({
    chunkSize: 900,
    chunkOverlap: 120,
  });
  private readonly embeddings: EmbeddingsInterface & { modelName?: string } =
    new LocalHashEmbeddings();
  private readonly pineconeIndexName =
    process.env.PINECONE_INDEX_NAME?.trim() || 'quickstart';
  private readonly pineconeNamespace =
    process.env.PINECONE_NAMESPACE?.trim() || 'ai-tools';
  private pineconeClient?: Pinecone;
  private pineconeIndex?: Index<RecordMetadata>;

  constructor(
    private readonly prismaService: PrismaService,
    private readonly cloudflareAi: CloudflareAiService,
    private readonly langfuse: LangfuseTracingService,
  ) {}

  private getPrisma() {
    const prisma = this.prismaService.getClient();

    if (!prisma) {
      throw new ServiceUnavailableException('Tool vector index persistence is not configured.');
    }

    return prisma;
  }

  getEmbeddingModelName() {
    return (
      this.cloudflareAi.getEmbeddingModelName() ??
      this.embeddings.modelName ??
      'unknown-embedding-model'
    );
  }

  getVectorStoreName() {
    return `pinecone:${this.pineconeIndexName}/${this.pineconeNamespace}`;
  }

  async indexAllTools() {
    const prisma = this.getPrisma();
    const tools = await prisma.aiTool.findMany({
      orderBy: [{ updatedAt: 'asc' }],
    });

    this.logIndexFlow('index_all_start', {
      toolCount: tools.length,
      embeddingModel: this.getEmbeddingModelName(),
      vectorStore: this.getVectorStoreName(),
    });

    for (const tool of tools) {
      await this.indexTool(tool);
    }

    this.logIndexFlow('index_all_done', {
      indexed: tools.length,
      embeddingModel: this.getEmbeddingModelName(),
    });

    return { indexed: tools.length, embeddingModel: this.getEmbeddingModelName() };
  }

  async ensureFreshIndex(limit = 50) {
    const prisma = this.getPrisma();
    const index = this.getPineconeIndex();
    const tools = await prisma.aiTool.findMany({
      orderBy: [{ updatedAt: 'desc' }],
      take: limit,
    });
    let indexed = 0;

    for (const tool of tools) {
      const vectorId = this.vectorId(tool.id, 0);
      const current = await index.fetch({
        ids: [vectorId],
        namespace: this.pineconeNamespace,
      });
      const currentRecord = current.records?.[vectorId];
      const metadata = currentRecord?.metadata;
      const sourceUpdatedAtMs = metadataNumber(metadata, 'sourceUpdatedAtMs');
      const embeddingModel = metadataString(metadata, 'embeddingModel');

      if (
        !currentRecord ||
        sourceUpdatedAtMs < tool.updatedAt.getTime() ||
        embeddingModel !== this.getEmbeddingModelName()
      ) {
        await this.indexTool(tool);
        indexed += 1;
      }
    }

    if (indexed > 0) {
      this.logger.log(`Refreshed ${indexed} stale AI tool vector record(s).`);
    }

    this.logIndexFlow('ensure_fresh_index_done', {
      checked: tools.length,
      indexed,
      embeddingModel: this.getEmbeddingModelName(),
    });

    return { indexed };
  }

  async indexTool(tool: RagToolRecord) {
    const index = this.getPineconeIndex();
    const documents = await this.buildDocuments(tool);
    const vectors = await this.embedDocuments(
      documents.map((document) => document.pageContent),
    );

    this.logIndexFlow('index_tool_vectors_ready', {
      toolId: tool.id,
      slug: tool.slug,
      chunks: documents.length,
      embeddingModel: this.getEmbeddingModelName(),
      vectorDimensions: vectors[0]?.length ?? 0,
    });
    const prisma = this.getPrisma();
    const existingEmbeddings = await prisma.aiToolEmbedding.findMany({
      where: { toolId: tool.id },
      select: { chunkIndex: true },
    });
    const existingVectorIds = existingEmbeddings.map((embedding) =>
      this.vectorId(tool.id, embedding.chunkIndex),
    );

    if (existingVectorIds.length > 0) {
      await this.deleteExistingVectors(index, existingVectorIds, tool.id);
    }

    await prisma.aiToolEmbedding.deleteMany({
      where: { toolId: tool.id },
    });

    await index.upsert({
      namespace: this.pineconeNamespace,
      records: documents.map((document, index) => ({
        id: this.vectorId(tool.id, index),
        values: vectors[index],
        metadata: {
          toolId: tool.id,
          chunkIndex: index,
          content: document.pageContent,
          contentHash: contentHash(document.pageContent),
          embeddingModel: this.getEmbeddingModelName(),
          sourceUpdatedAt: tool.updatedAt.toISOString(),
          sourceUpdatedAtMs: tool.updatedAt.getTime(),
          slug: tool.slug,
          name: tool.name,
          subcategory: tool.subcategory,
          company: tool.company,
          category: tool.category,
          pricingModel: tool.pricingModel,
          freePlan: tool.freePlan,
          freeTrial: tool.freeTrial,
          apiAvailable: tool.apiAvailable,
          openSource: tool.openSource,
          platforms: asStringArray(tool.platforms),
          status: tool.status,
          rating: tool.rating ?? 0,
          popularityScore: tool.popularityScore ?? 0,
          source: 'AiTool',
        },
      })),
    });

    await prisma.aiToolEmbedding.createMany({
      data: documents.map((document, index) => ({
        toolId: tool.id,
        chunkIndex: index,
        content: document.pageContent,
        contentHash: contentHash(document.pageContent),
        embedding: vectors[index] as Prisma.InputJsonValue,
        embeddingModel: this.getEmbeddingModelName(),
        metadata: {
          slug: tool.slug,
          name: tool.name,
          category: tool.category,
          subcategory: tool.subcategory,
          company: tool.company,
          pricingModel: tool.pricingModel,
          freePlan: tool.freePlan,
          freeTrial: tool.freeTrial,
          apiAvailable: tool.apiAvailable,
          openSource: tool.openSource,
          platforms: asStringArray(tool.platforms),
          status: tool.status,
          rating: tool.rating ?? 0,
          source: 'AiTool',
        },
        sourceUpdatedAt: tool.updatedAt,
      })),
    });

    this.logIndexFlow('index_tool_done', {
      toolId: tool.id,
      slug: tool.slug,
      chunks: documents.length,
    });

    return { toolId: tool.id, chunks: documents.length };
  }

  async indexToolById(toolId: string) {
    const tool = await this.getPrisma().aiTool.findUnique({
      where: { id: toolId },
    });

    if (!tool) {
      throw new ServiceUnavailableException(`Cannot index missing AI tool ${toolId}.`);
    }

    return this.indexTool(tool);
  }

  async searchSimilar(query: string, limit = 12) {
    const index = this.getPineconeIndex();
    const queryVector = await this.embedQuery(query);
    const results = await index.query({
      namespace: this.pineconeNamespace,
      vector: queryVector,
      topK: Math.max(limit * 4, 24),
      includeMetadata: true,
    });

    return results.matches
      .map((match) => {
        const content = metadataString(match.metadata, 'content');

        return {
          row: {
            toolId: metadataString(match.metadata, 'toolId'),
            content,
          },
          similarity: (match.score ?? 0) + keywordScore(query, content),
        };
      })
      .filter((match) => match.row.toolId && match.row.content)
      .sort((left, right) => right.similarity - left.similarity)
      .slice(0, limit);
  }

  async searchHybrid(
    query: string,
    filters: ToolMetadataFilters = {},
    limit = 18,
    traceId?: string,
  ) {
    const startedAt = Date.now();
    this.logIndexFlow('hybrid_search_start', {
      query: truncate(query, 160),
      filters,
      limit,
      mode: 'parallel-semantic-keyword',
    });
    const [semanticResults, keywordResults] = await Promise.all([
      this.searchSemantic(query, filters, limit, traceId),
      this.searchKeyword(query, filters, limit, traceId),
    ]);

    const rrfStartedAt = Date.now();
    const fused = this.fuseWithRrf(semanticResults, keywordResults, limit);
    this.langfuse.createSpan({
      traceId: traceId ?? '',
      name: '05 reciprocal_rank_fusion',
      startTime: rrfStartedAt,
      input: {
        semanticCount: semanticResults.length,
        keywordCount: keywordResults.length,
        limit,
      },
      output: {
        fusedCount: fused.length,
        topToolIds: fused.slice(0, 8).map((item) => item.row.toolId),
      },
      metadata: { algorithm: 'rrf', rrfK: 60 },
    });

    this.logIndexFlow('hybrid_search_done', {
      semanticCount: semanticResults.length,
      keywordCount: keywordResults.length,
      fusedCount: fused.length,
      latencyMs: Date.now() - startedAt,
      topToolIds: fused.slice(0, 8).map((item) => item.row.toolId),
    });

    return fused;
  }

  private async searchSemantic(
    query: string,
    filters: ToolMetadataFilters,
    limit: number,
    traceId?: string,
  ): Promise<RetrievedToolChunk[]> {
    const startedAt = Date.now();
    const index = this.getPineconeIndex();
    const queryVector = await this.embedQuery(query);
    const pineconeFilter = this.buildPineconeFilter(filters);
    const results = await index.query({
      namespace: this.pineconeNamespace,
      vector: queryVector,
      topK: Math.max(limit * 4, 24),
      includeMetadata: true,
      ...(pineconeFilter ? { filter: pineconeFilter } : {}),
    });

    const mapped = results.matches
      .map((match) => {
        const content = metadataString(match.metadata, 'content');

        return {
          row: {
            toolId: metadataString(match.metadata, 'toolId'),
            content,
          },
          similarity: (match.score ?? 0) + keywordScore(query, content),
          source: 'semantic' as const,
        };
      })
      .filter((match) => match.row.toolId && match.row.content)
      .sort((left, right) => right.similarity - left.similarity)
      .slice(0, limit);

    this.logIndexFlow('semantic_search_done', {
      query: truncate(query, 160),
      filters,
      count: mapped.length,
      latencyMs: Date.now() - startedAt,
      topToolIds: mapped.slice(0, 8).map((item) => item.row.toolId),
    });

    this.langfuse.createSpan({
      traceId: traceId ?? '',
      name: '04a pinecone_semantic_retrieval',
      startTime: startedAt,
      input: { query: truncate(query, 500), filters, limit },
      output: {
        count: mapped.length,
        chunks: mapped.slice(0, 12).map((item) => ({
          toolId: item.row.toolId,
          score: Number(item.similarity.toFixed(4)),
          content: truncate(item.row.content, 700),
        })),
      },
      metadata: {
        vectorStore: this.getVectorStoreName(),
        embeddingModel: this.getEmbeddingModelName(),
      },
    });

    return mapped;
  }

  private async searchKeyword(
    query: string,
    filters: ToolMetadataFilters,
    limit: number,
    traceId?: string,
  ): Promise<RetrievedToolChunk[]> {
    const startedAt = Date.now();
    const prisma = this.getPrisma();
    const tokens = tokenizeIntent(query);
    const fallbackQuery = tokens.join(' & ') || query;
    const conditions: string[] = [];
    const params: unknown[] = [query, fallbackQuery, limit];

    if (filters.category) {
      params.push(filters.category);
      conditions.push(`LOWER("category") = LOWER($${params.length})`);
    }

    if (filters.subcategory) {
      params.push(filters.subcategory);
      conditions.push(`LOWER("subcategory") = LOWER($${params.length})`);
    }

    if (filters.freeOnly) {
      conditions.push(`"freePlan" = 'Yes'`);
    }

    if (filters.apiOnly) {
      conditions.push(`"apiAvailable" = true`);
    }

    if (filters.openSourceOnly) {
      conditions.push(`"openSource" = true`);
    }

    if (filters.pricing) {
      params.push(filters.pricing);
      conditions.push(`LOWER("pricingModel") LIKE LOWER('%' || $${params.length} || '%')`);
    }

    if (filters.platform) {
      params.push(filters.platform);
      conditions.push(`LOWER("searchText") LIKE LOWER('%' || $${params.length} || '%')`);
    }

    const whereClause = conditions.length > 0 ? `AND ${conditions.join(' AND ')}` : '';
    const rows = await prisma.$queryRawUnsafe<
      Array<{ toolId: string; content: string; rank: number }>
    >(
      `
        SELECT
          "id" as "toolId",
          CONCAT_WS(
            E'\\n',
            'Tool: ' || "name",
            'Category: ' || "category" || ' / ' || "subcategory",
            'Description: ' || COALESCE("summary", "shortDescription"),
            'Search text: ' || "searchText"
          ) as "content",
          ts_rank_cd(
            to_tsvector('english', COALESCE("searchText", '') || ' ' || COALESCE("summary", '') || ' ' || COALESCE("shortDescription", '')),
            websearch_to_tsquery('english', $1)
          ) as "rank"
        FROM "aiverse_world"."AiTool"
        WHERE (
          to_tsvector('english', COALESCE("searchText", '') || ' ' || COALESCE("summary", '') || ' ' || COALESCE("shortDescription", ''))
            @@ websearch_to_tsquery('english', $1)
          OR LOWER("searchText") LIKE LOWER('%' || $2 || '%')
        )
        ${whereClause}
        ORDER BY "rank" DESC, "popularityScore" DESC NULLS LAST, "rating" DESC NULLS LAST
        LIMIT $3
      `,
      ...params,
    );

    const mapped = rows.map((row) => ({
      row: {
        toolId: row.toolId,
        content: row.content,
      },
      similarity: Number(row.rank) + keywordScore(query, row.content),
      source: 'keyword' as const,
    }));

    this.logIndexFlow('keyword_search_done', {
      query: truncate(query, 160),
      filters,
      count: mapped.length,
      latencyMs: Date.now() - startedAt,
      ranking: 'postgres-ts_rank_cd-websearch',
      topToolIds: mapped.slice(0, 8).map((item) => item.row.toolId),
    });

    this.langfuse.createSpan({
      traceId: traceId ?? '',
      name: '04b postgres_keyword_retrieval',
      startTime: startedAt,
      input: { query: truncate(query, 500), filters, limit },
      output: {
        count: mapped.length,
        chunks: mapped.slice(0, 12).map((item) => ({
          toolId: item.row.toolId,
          score: Number(item.similarity.toFixed(4)),
          content: truncate(item.row.content, 700),
        })),
      },
      metadata: {
        ranking: 'postgres-ts_rank_cd-websearch',
        bm25Style: true,
      },
    });

    return mapped;
  }

  private fuseWithRrf(
    semanticResults: RetrievedToolChunk[],
    keywordResults: RetrievedToolChunk[],
    limit: number,
  ): RetrievedToolChunk[] {
    const rrfK = 60;
    const fused = new Map<
      string,
      { item: RetrievedToolChunk; score: number; sources: Set<string> }
    >();
    const addRanked = (items: RetrievedToolChunk[]) => {
      items.forEach((item, index) => {
        const current =
          fused.get(item.row.toolId) ?? {
            item,
            score: 0,
            sources: new Set<string>(),
          };

        current.score += 1 / (rrfK + index + 1);
        current.score += Math.max(0, item.similarity) * 0.02;
        current.sources.add(item.source);

        if (item.similarity > current.item.similarity) {
          current.item = item;
        }

        fused.set(item.row.toolId, current);
      });
    };

    addRanked(semanticResults);
    addRanked(keywordResults);

    return Array.from(fused.values())
      .sort((left, right) => right.score - left.score)
      .slice(0, limit)
      .map(({ item, score, sources }) => ({
        ...item,
        similarity: score,
        source: sources.size > 1 ? 'hybrid' : item.source,
      }));
  }

  private buildPineconeFilter(filters: ToolMetadataFilters) {
    const filter: Record<string, unknown> = {};

    if (filters.category) {
      filter.category = { $eq: filters.category };
    }

    if (filters.subcategory) {
      filter.subcategory = { $eq: filters.subcategory };
    }

    if (filters.freeOnly) {
      filter.freePlan = { $eq: 'Yes' };
    }

    if (filters.apiOnly) {
      filter.apiAvailable = { $eq: true };
    }

    if (filters.openSourceOnly) {
      filter.openSource = { $eq: true };
    }

    if (filters.pricing) {
      filter.pricingModel = { $eq: filters.pricing };
    }

    return Object.keys(filter).length > 0 ? filter : null;
  }

  private async embedDocuments(documents: string[]) {
    const cloudflareRows = await this.cloudflareAi.embedTexts(documents);

    if (cloudflareRows) {
      this.logIndexFlow('embedding_provider_used', {
        provider: 'cloudflare',
        count: documents.length,
        dimensions: cloudflareRows[0]?.length ?? 0,
      });
      return cloudflareRows;
    }

    const localRows = await this.embeddings.embedDocuments(documents);
    this.logIndexFlow('embedding_provider_used', {
      provider: 'local-hash-fallback',
      count: documents.length,
      dimensions: localRows[0]?.length ?? 0,
    });
    return localRows;
  }

  private async embedQuery(query: string) {
    const rows = await this.cloudflareAi.embedTexts([query]);

    if (rows?.[0]) {
      this.logIndexFlow('query_embedding_provider_used', {
        provider: 'cloudflare',
        dimensions: rows[0].length,
      });
      return rows[0];
    }

    const localRow = await this.embeddings.embedQuery(query);
    this.logIndexFlow('query_embedding_provider_used', {
      provider: 'local-hash-fallback',
      dimensions: localRow.length,
    });
    return localRow;
  }

  private getPineconeIndex() {
    const apiKey = process.env.PINECONE_API_KEY?.trim();

    if (!apiKey) {
      throw new ServiceUnavailableException(
        'PINECONE_API_KEY is not configured. AI Finder RAG requires Pinecone.',
      );
    }

    if (!this.pineconeClient) {
      this.pineconeClient = new Pinecone({ apiKey });
    }

    if (!this.pineconeIndex) {
      const host = process.env.PINECONE_INDEX_HOST?.trim();
      this.pineconeIndex = host
        ? this.pineconeClient.index<RecordMetadata>({ host })
        : this.pineconeClient.index<RecordMetadata>(this.pineconeIndexName);
    }

    return this.pineconeIndex;
  }

  private vectorId(toolId: string, chunkIndex: number) {
    return `${toolId}:${chunkIndex}`;
  }

  private async deleteExistingVectors(
    index: Index<RecordMetadata>,
    vectorIds: string[],
    toolId: string,
  ) {
    try {
      await index.deleteMany({
        namespace: this.pineconeNamespace,
        ids: vectorIds,
      });
    } catch (error) {
      if (this.isPineconeNotFound(error)) {
        this.logger.warn(
          `Pinecone had no existing vectors to delete for AI tool ${toolId}; continuing with fresh upsert.`,
        );
        return;
      }

      throw error;
    }
  }

  private isPineconeNotFound(error: unknown) {
    return (
      error instanceof Error &&
      (error.name === 'PineconeNotFoundError' || error.message.includes('status 404'))
    );
  }

  private async buildDocuments(tool: RagToolRecord) {
    const content = [
      `Tool: ${tool.name}`,
      `Category: ${tool.category} / ${tool.subcategory}`,
      `Company: ${tool.company}`,
      `Description: ${tool.shortDescription}`,
      `Summary: ${tool.summary ?? tool.shortDescription}`,
      `Features: ${asStringArray(tool.features).join(', ')}`,
      `Best for: ${asStringArray(tool.bestFor).join(', ')}`,
      `Tags: ${asStringArray(tool.tags).join(', ')}`,
      `Audience: ${asStringArray(tool.targetAudience).join(', ')}`,
      `AI type: ${asStringArray(tool.aiType).join(', ')}`,
      `Modalities: ${asStringArray(tool.modalities).join(', ')}`,
      `Providers: ${asStringArray(tool.modelProvider).join(', ')}`,
      `Platforms: ${asStringArray(tool.platforms).join(', ')}`,
      `Pricing: ${tool.pricingModel}; free plan: ${tool.freePlan}; free trial: ${
        tool.freeTrial ? 'yes' : 'no'
      }`,
      `API available: ${tool.apiAvailable ? 'yes' : 'no'}`,
      `Open source: ${tool.openSource ? 'yes' : 'no'}`,
      `Status: ${tool.status}`,
      `Rating: ${tool.rating ?? 'unknown'}`,
      `Catalog search text: ${tool.searchText}`,
    ].join('\n');

    return this.splitter.splitDocuments([
      new Document({
        pageContent: content,
        metadata: {
          toolId: tool.id,
          slug: tool.slug,
          name: tool.name,
          category: tool.category,
          source: 'AiTool',
        },
      }),
    ]);
  }

  private logIndexFlow(event: string, payload: Record<string, unknown>) {
    this.logger.log(`ai_finder_index event=${event} ${JSON.stringify(payload)}`);
  }
}
