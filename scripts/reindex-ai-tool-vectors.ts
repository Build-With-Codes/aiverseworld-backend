import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { Prisma, PrismaClient } from '@prisma/client';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import { Pinecone, type Index, type RecordMetadata } from '@pinecone-database/pinecone';
import { createHash } from 'node:crypto';
import { Pool } from 'pg';
import { LocalHashEmbeddings } from '../src/tools/local-hash-embeddings';

const schemaName = 'aiverse_world';

function withSchema(raw: string) {
  try {
    const url = new URL(raw);
    url.searchParams.set('schema', schemaName);
    return url.toString();
  } catch {
    return raw;
  }
}

function asStringArray(value: Prisma.JsonValue | null | undefined): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function contentHash(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

function getPineconeIndex(): { index: Index<RecordMetadata>; namespace: string } {
  const apiKey = process.env.PINECONE_API_KEY?.trim();
  const indexName = process.env.PINECONE_INDEX_NAME?.trim() || 'quickstart';
  const namespace = process.env.PINECONE_NAMESPACE?.trim() || 'ai-tools';

  if (!apiKey) {
    throw new Error('Set PINECONE_API_KEY before reindexing AI tool vectors.');
  }

  const pinecone = new Pinecone({ apiKey });
  const host = process.env.PINECONE_INDEX_HOST?.trim();
  const index = host
    ? pinecone.index<RecordMetadata>({ host })
    : pinecone.index<RecordMetadata>(indexName);

  return { index, namespace };
}

function toolContent(tool: Awaited<ReturnType<PrismaClient['aiTool']['findMany']>>[number]) {
  return [
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
}

async function main() {
  const databaseUrl = process.env.DIRECT_URL ?? process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error('Set DIRECT_URL, DIRECT_DATABASE_URL, or DATABASE_URL before reindexing AI tool vectors.');
  }

  const pool = new Pool({ connectionString: withSchema(databaseUrl) });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
  const splitter = new RecursiveCharacterTextSplitter({ chunkSize: 900, chunkOverlap: 120 });
  const embeddings = new LocalHashEmbeddings();
  const { index: pineconeIndex, namespace } = getPineconeIndex();

  try {
    const tools = await prisma.aiTool.findMany({ orderBy: { rank: 'asc' } });

    for (const tool of tools) {
      const chunks = await splitter.splitText(toolContent(tool));
      const vectors = await embeddings.embedDocuments(chunks);

      await pineconeIndex.upsert({
        namespace,
        records: chunks.map((chunk, index) => ({
          id: `${tool.id}:${index}`,
          values: vectors[index],
          metadata: {
            toolId: tool.id,
            chunkIndex: index,
            content: chunk,
            contentHash: contentHash(chunk),
            embeddingModel: embeddings.modelName,
            sourceUpdatedAt: tool.updatedAt.toISOString(),
            sourceUpdatedAtMs: tool.updatedAt.getTime(),
            slug: tool.slug,
            name: tool.name,
            category: tool.category,
            source: 'AiTool',
          },
        })),
      });
    }

    console.log(`Reindexed vectors for ${tools.length} AI tools in Pinecone namespace "${namespace}".`);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
