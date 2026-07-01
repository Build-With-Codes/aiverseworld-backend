import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { Document } from '@langchain/core/documents';
import type { EmbeddingsInterface } from '@langchain/core/embeddings';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import { Pinecone, type Index, type RecordMetadata } from '@pinecone-database/pinecone';
import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
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

  constructor(private readonly prismaService: PrismaService) {}

  private getPrisma() {
    const prisma = this.prismaService.getClient();

    if (!prisma) {
      throw new ServiceUnavailableException('Tool vector index persistence is not configured.');
    }

    return prisma;
  }

  getEmbeddingModelName() {
    return this.embeddings.modelName ?? 'unknown-embedding-model';
  }

  getVectorStoreName() {
    return `pinecone:${this.pineconeIndexName}/${this.pineconeNamespace}`;
  }

  async indexAllTools() {
    const prisma = this.getPrisma();
    const tools = await prisma.aiTool.findMany({
      orderBy: [{ updatedAt: 'asc' }],
    });

    for (const tool of tools) {
      await this.indexTool(tool);
    }

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

    return { indexed };
  }

  async indexTool(tool: RagToolRecord) {
    const index = this.getPineconeIndex();
    const documents = await this.buildDocuments(tool);
    const vectors = await this.embeddings.embedDocuments(
      documents.map((document) => document.pageContent),
    );

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
          category: tool.category,
          source: 'AiTool',
        },
      })),
    });

    return { toolId: tool.id, chunks: documents.length };
  }

  async searchSimilar(query: string, limit = 12) {
    const index = this.getPineconeIndex();
    const queryVector = await this.embeddings.embedQuery(query);
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

  private async buildDocuments(tool: RagToolRecord) {
    const content = [
      `Tool: ${tool.name}`,
      `Company: ${tool.company}`,
      `Category: ${tool.category} / ${tool.subcategory}`,
      `Description: ${tool.summary ?? tool.shortDescription}`,
      `Features: ${asStringArray(tool.features).join(', ')}`,
      `Best for: ${asStringArray(tool.bestFor).join(', ')}`,
      `Audience: ${asStringArray(tool.targetAudience).join(', ')}`,
      `Tags: ${asStringArray(tool.tags).join(', ')}`,
      `AI type: ${asStringArray(tool.aiType).join(', ')}`,
      `Modalities: ${asStringArray(tool.modalities).join(', ')}`,
      `Providers: ${asStringArray(tool.modelProvider).join(', ')}`,
      `Platforms: ${asStringArray(tool.platforms).join(', ')}`,
      `Pricing: ${tool.pricingModel}; free plan: ${tool.freePlan}`,
      `API available: ${tool.apiAvailable ? 'yes' : 'no'}`,
      `Open source: ${tool.openSource ? 'yes' : 'no'}`,
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
}
