import { Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { htmlToBlocks, type Block } from './blog-blocks';

type MediaRow = {
  id: string;
  url: string;
  altText: string | null;
  caption: string | null;
  credit: string | null;
  license: string | null;
  width: number | null;
  height: number | null;
  blurDataUrl: string | null;
};

type BlogRow = {
  id: string;
  slug: string;
  title: string;
  description: string;
  content: string;
  contentBlocks: Prisma.JsonValue | null;
  category: string;
  tags: Prisma.JsonValue | null;
  author: string;
  coverImage: string | null;
  coverMedia: MediaRow | null;
  galleryJson: Prisma.JsonValue | null;
  seoTitle: string | null;
  metaDescription: string | null;
  readTime: string;
  themeJson: Prisma.JsonValue | null;
  featured: boolean;
  published: boolean;
  publishedAt: Date;
  updatedAt: Date;
};

function asStringArray(value: Prisma.JsonValue | null): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function toMediaRef(media: MediaRow | null, fallbackAlt: string) {
  if (!media) return undefined;
  return {
    id: media.id,
    url: media.url,
    alt: media.altText ?? fallbackAlt,
    caption: media.caption ?? undefined,
    credit: media.credit ?? undefined,
    license: media.license ?? undefined,
    width: media.width ?? undefined,
    height: media.height ?? undefined,
    blurDataUrl: media.blurDataUrl ?? undefined,
  };
}

/** List card — omits the heavy `content` body. */
function toCard(row: Omit<BlogRow, 'content'>) {
  const cover =
    toMediaRef(row.coverMedia, row.title) ??
    (row.coverImage ? { url: row.coverImage, alt: row.title } : undefined);

  return {
    slug: row.slug,
    title: row.title,
    description: row.description,
    category: row.category,
    tags: asStringArray(row.tags),
    author: row.author,
    cover,
    coverImage: cover?.url, // legacy convenience
    gallery: Array.isArray(row.galleryJson) ? row.galleryJson : [],
    readTime: row.readTime,
    featured: row.featured,
    published: row.published,
    publishedAt: row.publishedAt.toISOString().slice(0, 10),
    updatedAt: row.updatedAt.toISOString(),
    theme: row.themeJson ?? undefined,
  };
}

function toFull(row: BlogRow) {
  // Prefer stored blocks; derive from HTML on the fly if a post predates the
  // block backfill. `content` (HTML) is retained only as a crawler/RSS fallback.
  const blocks =
    Array.isArray(row.contentBlocks) && row.contentBlocks.length > 0
      ? (row.contentBlocks as unknown as Block[])
      : htmlToBlocks(row.content);

  return {
    ...toCard(row),
    blocks,
    content: row.content,
    seoTitle: row.seoTitle ?? undefined,
    metaDescription: row.metaDescription ?? undefined,
  };
}

export type AdminBlogInput = {
  slug?: string;
  title: string;
  description: string;
  content: string;
  contentBlocks?: Block[];
  category: string;
  tags?: string[];
  author?: string;
  coverImage?: string | null;
  coverMediaId?: string | null;
  galleryJson?: unknown[];
  seoTitle?: string | null;
  metaDescription?: string | null;
  readTime?: string;
  featured?: boolean;
  published?: boolean;
  publishedAt?: string | null;
};

const mediaSelect = {
  id: true,
  url: true,
  altText: true,
  caption: true,
  credit: true,
  license: true,
  width: true,
  height: true,
  blurDataUrl: true,
} as const;

const cardSelect = {
  id: true,
  slug: true,
  title: true,
  description: true,
  category: true,
  tags: true,
  author: true,
  coverImage: true,
  coverMedia: { select: mediaSelect },
  galleryJson: true,
  seoTitle: true,
  metaDescription: true,
  readTime: true,
  themeJson: true,
  featured: true,
  published: true,
  publishedAt: true,
  updatedAt: true,
} as const;

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

@Injectable()
export class BlogService {
  constructor(private readonly prismaService: PrismaService) {}

  private getPrisma() {
    const prisma = this.prismaService.getClient();
    if (!prisma) {
      throw new ServiceUnavailableException('Blog persistence is not configured.');
    }
    return prisma;
  }

  async list(input: { page: number; limit: number; category?: string; tag?: string }) {
    const prisma = this.getPrisma();
    const page = Math.max(1, input.page);
    const limit = Math.max(1, Math.min(input.limit, 48));

    const where: Prisma.BlogPostWhereInput = { published: true };
    if (input.category) {
      where.category = { equals: input.category, mode: 'insensitive' };
    }
    if (input.tag) {
      where.tags = { array_contains: [input.tag] };
    }

    const [total, rows, grouped] = await Promise.all([
      prisma.blogPost.count({ where }),
      prisma.blogPost.findMany({
        where,
        orderBy: [{ featured: 'desc' }, { publishedAt: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
        select: cardSelect,
      }),
      prisma.blogPost.groupBy({
        by: ['category'],
        where: { published: true },
        _count: { category: true },
        orderBy: { category: 'asc' },
      }),
    ]);

    return {
      data: rows.map(toCard),
      categories: grouped.map((g) => ({ name: g.category, count: g._count.category })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }

  async getBySlug(slug: string) {
    const prisma = this.getPrisma();
    const row = await prisma.blogPost.findFirst({
      where: { slug, published: true },
      include: { coverMedia: { select: mediaSelect } },
    });
    return row ? { data: toFull(row as unknown as BlogRow) } : { data: null };
  }

  async getSlugs() {
    const prisma = this.getPrisma();
    const rows = await prisma.blogPost.findMany({
      where: { published: true },
      select: { slug: true, updatedAt: true },
      orderBy: { publishedAt: 'desc' },
    });
    return { data: rows.map((r) => ({ slug: r.slug, updatedAt: r.updatedAt.toISOString() })) };
  }

  async getRelated(slug: string, limit = 3) {
    const prisma = this.getPrisma();
    const current = await prisma.blogPost.findUnique({
      where: { slug },
      select: { category: true },
    });
    if (!current) return { data: [] };

    const rows = await prisma.blogPost.findMany({
      where: { published: true, slug: { not: slug }, category: current.category },
      orderBy: { publishedAt: 'desc' },
      take: Math.max(1, Math.min(limit, 6)),
      select: cardSelect,
    });

    if (rows.length < limit) {
      const filler = await prisma.blogPost.findMany({
        where: { published: true, slug: { not: slug }, category: { not: current.category } },
        orderBy: { publishedAt: 'desc' },
        take: limit - rows.length,
        select: cardSelect,
      });
      return { data: [...rows, ...filler].map(toCard) };
    }
    return { data: rows.map(toCard) };
  }

  async upsert(input: AdminBlogInput) {
    const prisma = this.getPrisma();
    const slug = (input.slug?.trim() || slugify(input.title)).slice(0, 200);
    const publishedAt = input.publishedAt ? new Date(input.publishedAt) : new Date();

    // Blocks are the source of truth; if the admin sent HTML only, derive them.
    const blocks =
      input.contentBlocks && input.contentBlocks.length > 0
        ? input.contentBlocks
        : htmlToBlocks(input.content);

    const data = {
      title: input.title,
      description: input.description,
      content: input.content,
      contentBlocks: blocks as unknown as Prisma.InputJsonValue,
      category: input.category,
      author: input.author ?? 'AiverseWorld Team',
      readTime: input.readTime ?? '5 min',
      coverImage: input.coverImage ?? null,
      coverMediaId: input.coverMediaId ?? null,
      galleryJson: (input.galleryJson ?? Prisma.JsonNull) as Prisma.InputJsonValue,
      seoTitle: input.seoTitle ?? null,
      metaDescription: input.metaDescription ?? null,
      tags: (input.tags ?? [input.category]) as Prisma.InputJsonValue,
      featured: input.featured ?? false,
      published: input.published ?? true,
      publishedAt: Number.isNaN(publishedAt.getTime()) ? new Date() : publishedAt,
    };

    const row = await prisma.blogPost.upsert({
      where: { slug },
      update: data,
      create: { slug, ...data },
      include: { coverMedia: { select: mediaSelect } },
    });
    return { data: toFull(row as unknown as BlogRow) };
  }

  /** Admin listing — includes drafts, ordered by most recently updated. */
  async adminList(input: { page: number; limit: number }) {
    const prisma = this.getPrisma();
    const page = Math.max(1, input.page);
    const limit = Math.max(1, Math.min(input.limit, 100));

    const [total, rows] = await Promise.all([
      prisma.blogPost.count(),
      prisma.blogPost.findMany({
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        select: cardSelect,
      }),
    ]);

    return {
      data: rows.map(toCard),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }

  /** Admin fetch by slug — unlike `getBySlug`, includes unpublished drafts. */
  async adminGetBySlug(slug: string) {
    const prisma = this.getPrisma();
    const row = await prisma.blogPost.findUnique({
      where: { slug },
      include: { coverMedia: { select: mediaSelect } },
    });
    return { data: row ? toFull(row as unknown as BlogRow) : null };
  }

  async delete(slug: string) {
    const prisma = this.getPrisma();
    try {
      await prisma.blogPost.delete({ where: { slug } });
    } catch {
      throw new NotFoundException(`No blog post found with slug "${slug}".`);
    }
    return { data: { slug, deleted: true } };
  }
}
