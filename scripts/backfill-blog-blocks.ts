import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { Prisma, PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { htmlToBlocks } from '../src/blog/blog-blocks';

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

async function main() {
  const databaseUrl =
    process.env.DIRECT_URL ?? process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('Set DATABASE_URL before backfilling blog blocks.');

  const pool = new Pool({ connectionString: withSchema(databaseUrl) });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  try {
    const posts = await prisma.blogPost.findMany({ select: { id: true, slug: true, content: true } });
    let updated = 0;
    for (const post of posts) {
      const blocks = htmlToBlocks(post.content);
      await prisma.blogPost.update({
        where: { id: post.id },
        data: { contentBlocks: blocks as unknown as Prisma.InputJsonValue },
      });
      console.log(`  ${post.slug}: ${blocks.length} blocks`);
      updated += 1;
    }
    console.log(`✓ Backfilled content blocks for ${updated} post(s).`);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((error) => {
  console.error('Block backfill failed:', error);
  process.exit(1);
});
