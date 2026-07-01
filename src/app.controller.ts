import { Controller, Get } from '@nestjs/common';
import { Pinecone } from '@pinecone-database/pinecone';
import { AppService } from './app.service';
import { PrismaService } from './database/prisma.service';

@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly prismaService: PrismaService,
  ) {}

  @Get()
  getHello() {
    return this.appService.getHello();
  }

  @Get('health')
  async health() {
    const database = this.prismaService.getStatus();
    const vectorDatabase = await this.getVectorDatabaseStatus();

    return {
      status: database.connected && vectorDatabase.connected ? 'ok' : 'degraded',
      database,
      vectorDatabase,
    };
  }

  private async getVectorDatabaseStatus() {
    const apiKey = process.env.PINECONE_API_KEY?.trim();
    const indexName =
      process.env.PINECONE_INDEX_NAME?.trim() || 'quickstart';
    const namespace = process.env.PINECONE_NAMESPACE?.trim() || 'ai-tools';
    const host = process.env.PINECONE_INDEX_HOST?.trim();
    const dimension = Number(process.env.AI_TOOL_EMBEDDING_DIMENSION ?? 1024);
    const baseStatus = {
      provider: 'pinecone',
      configured: Boolean(apiKey),
      connected: false,
      index: indexName,
      namespace,
      hostConfigured: Boolean(host),
      embeddingModel: 'local-hash-embedding-v1',
      dimension,
      metric: 'cosine',
      totalRecordCount: null as number | null,
      namespaceRecordCount: null as number | null,
      lastError: null as string | null,
    };

    if (!apiKey) {
      return {
        ...baseStatus,
        lastError: 'PINECONE_API_KEY is not configured.',
      };
    }

    try {
      const pinecone = new Pinecone({ apiKey });
      const index = host ? pinecone.index({ host }) : pinecone.index(indexName);
      const stats = await index.describeIndexStats();

      return {
        ...baseStatus,
        connected: true,
        totalRecordCount: stats.totalRecordCount ?? null,
        namespaceRecordCount: stats.namespaces?.[namespace]?.recordCount ?? null,
      };
    } catch (error) {
      return {
        ...baseStatus,
        lastError: error instanceof Error ? error.message : 'Unable to connect to Pinecone.',
      };
    }
  }
}
