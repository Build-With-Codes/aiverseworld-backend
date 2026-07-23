import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { Prisma, PrismaClient } from '@prisma/client';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Pool } from 'pg';
import { htmlToBlocks } from '../src/blog/blog-blocks';

const schemaName = 'aiverse_world';

type SeedPost = {
  slug: string;
  title: string;
  description: string;
  content: string;
  category: string;
  publishedAt: string;
  readTime: string;
  author: string;
  seoTitle?: string;
  metaDescription?: string;
  coverImage?: string;
  tags?: string[];
  featured?: boolean;
  theme?: Record<string, unknown>;
};

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
  if (!databaseUrl) {
    throw new Error('Set DIRECT_URL, DIRECT_DATABASE_URL, or DATABASE_URL before importing blog posts.');
  }

  const jsonPath = join(__dirname, '..', 'data', 'blog-posts.json');
  const posts = JSON.parse(readFileSync(jsonPath, 'utf8')) as SeedPost[];

  const pool = new Pool({ connectionString: withSchema(databaseUrl) });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  try {
    await prisma.$executeRawUnsafe(`CREATE SCHEMA IF NOT EXISTS "${schemaName}"`);

    let count = 0;
    for (const [index, post] of posts.entries()) {
      const publishedAt = new Date(post.publishedAt);
      const data = {
        title: post.title,
        description: post.description,
        content: post.content,
        contentBlocks: htmlToBlocks(post.content) as unknown as Prisma.InputJsonValue,
        category: post.category,
        author: post.author,
        readTime: post.readTime || '5 min',
        seoTitle: post.seoTitle ?? null,
        metaDescription: post.metaDescription ?? null,
        coverImage: post.coverImage ?? null,
        tags: (post.tags ?? [post.category]) as Prisma.InputJsonValue,
        themeJson: (post.theme ?? Prisma.JsonNull) as Prisma.InputJsonValue,
        // Feature the two most recent posts by default.
        featured: post.featured ?? index < 2,
        published: true,
        publishedAt: Number.isNaN(publishedAt.getTime()) ? new Date() : publishedAt,
      };

      await prisma.blogPost.upsert({
        where: { slug: post.slug },
        update: data,
        create: { slug: post.slug, ...data },
      });
      count += 1;
    }

    console.log(`✓ Imported/updated ${count} blog post(s).`);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((error) => {
  console.error('Blog import failed:', error);
  process.exit(1);
});
