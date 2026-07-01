import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { Prisma, PrismaClient } from '@prisma/client';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import { Pinecone, type Index, type RecordMetadata } from '@pinecone-database/pinecone';
import { createHash } from 'node:crypto';
import { Pool } from 'pg';
import { LocalHashEmbeddings } from '../src/tools/local-hash-embeddings';
// The seed source lives in the sibling Next app and is intentionally outside this TS project.
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import { aiTools } from '../../aiinverseworld/lib/site-data';

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

function buildSearchText(tool: (typeof aiTools)[number]) {
  return [
    tool.name,
    tool.company,
    tool.category,
    tool.subcategory,
    tool.shortDescription,
    tool.summary,
    tool.pricingModel,
    tool.freePlan,
    tool.features.join(' '),
    tool.bestFor.join(' '),
    tool.targetAudience.join(' '),
    tool.tags.join(' '),
    tool.aiType.join(' '),
    tool.modalities.join(' '),
    tool.modelProvider.join(' '),
    tool.modelNames?.join(' '),
    tool.deploymentType.join(' '),
    tool.platforms.join(' '),
    tool.integrations?.join(' '),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function nullableJsonArray(value: string[] | undefined) {
  return value ?? Prisma.JsonNull;
}

function contentHash(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

function getPineconeIndex(): { index: Index<RecordMetadata>; namespace: string } {
  const apiKey = process.env.PINECONE_API_KEY?.trim();
  const indexName = process.env.PINECONE_INDEX_NAME?.trim() || 'quickstart';
  const namespace = process.env.PINECONE_NAMESPACE?.trim() || 'ai-tools';

  if (!apiKey) {
    throw new Error('Set PINECONE_API_KEY before importing and reindexing AI tool vectors.');
  }

  const pinecone = new Pinecone({ apiKey });
  const host = process.env.PINECONE_INDEX_HOST?.trim();
  const index = host
    ? pinecone.index<RecordMetadata>({ host })
    : pinecone.index<RecordMetadata>(indexName);

  return { index, namespace };
}

async function reindexVectors(
  prisma: PrismaClient,
  pineconeTarget: { index: Index<RecordMetadata>; namespace: string },
) {
  const splitter = new RecursiveCharacterTextSplitter({ chunkSize: 900, chunkOverlap: 120 });
  const embeddings = new LocalHashEmbeddings();
  const { index: pineconeIndex, namespace } = pineconeTarget;
  const tools = await prisma.aiTool.findMany({ orderBy: { rank: 'asc' } });

  for (const tool of tools) {
    const content = [
      `Tool: ${tool.name}`,
      `Company: ${tool.company}`,
      `Category: ${tool.category} / ${tool.subcategory}`,
      `Description: ${tool.summary ?? tool.shortDescription}`,
      `Features: ${(tool.features as string[]).join(', ')}`,
      `Best for: ${(tool.bestFor as string[]).join(', ')}`,
      `Audience: ${(tool.targetAudience as string[]).join(', ')}`,
      `Tags: ${(tool.tags as string[]).join(', ')}`,
      `AI type: ${(tool.aiType as string[]).join(', ')}`,
      `Modalities: ${(tool.modalities as string[]).join(', ')}`,
      `Providers: ${(tool.modelProvider as string[]).join(', ')}`,
      `Platforms: ${(tool.platforms as string[]).join(', ')}`,
      `Pricing: ${tool.pricingModel}; free plan: ${tool.freePlan}`,
      `API available: ${tool.apiAvailable ? 'yes' : 'no'}`,
      `Open source: ${tool.openSource ? 'yes' : 'no'}`,
      `Catalog search text: ${tool.searchText}`,
    ].join('\n');
    const chunks = await splitter.splitText(content);
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

  return tools.length;
}

async function main() {
  const databaseUrl = process.env.DIRECT_URL ?? process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL;
  const pineconeTarget = getPineconeIndex();

  if (!databaseUrl) {
    throw new Error('Set DIRECT_URL, DIRECT_DATABASE_URL, or DATABASE_URL before importing AI tools.');
  }

  const pool = new Pool({ connectionString: withSchema(databaseUrl) });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  try {
    await prisma.$executeRawUnsafe(`CREATE SCHEMA IF NOT EXISTS "${schemaName}"`);

    const source = await prisma.aiToolSource.upsert({
      where: { name: 'aiinverseworld-static-catalog' },
      update: {
        type: 'static-typescript',
        baseUrl: '../aiinverseworld/lib/site-data.ts',
        isActive: true,
        lastSyncedAt: new Date(),
      },
      create: {
        name: 'aiinverseworld-static-catalog',
        type: 'static-typescript',
        baseUrl: '../aiinverseworld/lib/site-data.ts',
        isActive: true,
        lastSyncedAt: new Date(),
      },
    });

    for (const tool of aiTools) {
      await prisma.aiTool.upsert({
        where: { slug: tool.slug },
        update: {
          sourceId: source.id,
          rank: tool.rank,
          name: tool.name,
          category: tool.category,
          subcategory: tool.subcategory,
          company: tool.company,
          website: tool.website,
          domain: tool.domain,
          favicon: tool.favicon,
          logoUrl: tool.logoUrl ?? null,
          freePlan: tool.freePlan,
          freeTrial: tool.freeTrial,
          pricingModel: tool.pricingModel,
          startingPriceUsd: tool.startingPriceUsd,
          pricingNotes: tool.pricingNotes ?? null,
          shortDescription: tool.shortDescription,
          summary: tool.summary ?? null,
          features: tool.features,
          bestFor: tool.bestFor,
          targetAudience: tool.targetAudience,
          tags: tool.tags,
          aiType: tool.aiType,
          modalities: tool.modalities,
          modelProvider: tool.modelProvider,
          modelNames: nullableJsonArray(tool.modelNames),
          apiAvailable: tool.apiAvailable,
          openSource: tool.openSource,
          deploymentType: tool.deploymentType,
          platforms: tool.platforms,
          integrations: nullableJsonArray(tool.integrations),
          teamCollaboration: tool.teamCollaboration ?? null,
          security: nullableJsonArray(tool.security),
          privacyNotes: tool.privacyNotes ?? null,
          popularityScore: tool.popularityScore ?? null,
          rating: tool.rating ?? null,
          reviewCount: tool.reviewCount ?? null,
          status: tool.status,
          launchYear: tool.launchYear ?? null,
          lastVerified: tool.lastVerified ? new Date(`${tool.lastVerified}T00:00:00.000Z`) : null,
          sourceUrl: tool.sourceUrl,
          sourceType: tool.sourceType,
          searchText: buildSearchText(tool),
        },
        create: {
          sourceId: source.id,
          rank: tool.rank,
          name: tool.name,
          slug: tool.slug,
          category: tool.category,
          subcategory: tool.subcategory,
          company: tool.company,
          website: tool.website,
          domain: tool.domain,
          favicon: tool.favicon,
          logoUrl: tool.logoUrl ?? null,
          freePlan: tool.freePlan,
          freeTrial: tool.freeTrial,
          pricingModel: tool.pricingModel,
          startingPriceUsd: tool.startingPriceUsd,
          pricingNotes: tool.pricingNotes ?? null,
          shortDescription: tool.shortDescription,
          summary: tool.summary ?? null,
          features: tool.features,
          bestFor: tool.bestFor,
          targetAudience: tool.targetAudience,
          tags: tool.tags,
          aiType: tool.aiType,
          modalities: tool.modalities,
          modelProvider: tool.modelProvider,
          modelNames: nullableJsonArray(tool.modelNames),
          apiAvailable: tool.apiAvailable,
          openSource: tool.openSource,
          deploymentType: tool.deploymentType,
          platforms: tool.platforms,
          integrations: nullableJsonArray(tool.integrations),
          teamCollaboration: tool.teamCollaboration ?? null,
          security: nullableJsonArray(tool.security),
          privacyNotes: tool.privacyNotes ?? null,
          popularityScore: tool.popularityScore ?? null,
          rating: tool.rating ?? null,
          reviewCount: tool.reviewCount ?? null,
          status: tool.status,
          launchYear: tool.launchYear ?? null,
          lastVerified: tool.lastVerified ? new Date(`${tool.lastVerified}T00:00:00.000Z`) : null,
          sourceUrl: tool.sourceUrl,
          sourceType: tool.sourceType,
          searchText: buildSearchText(tool),
        },
      });
    }

    const reindexed = await reindexVectors(prisma, pineconeTarget);
    console.log(`Imported ${aiTools.length} AI tools into Postgres.`);
    console.log(`Reindexed vectors for ${reindexed} AI tools in Pinecone.`);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
