import { Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

type SeoInput = {
  type?: string;
  slug?: string;
  query?: string;
  id?: string;
};

type SeoPayload = {
  title: string;
  description: string;
  keywords: string[];
  canonical: string;
  openGraph?: {
    title: string;
    description: string;
    image?: string;
    type?: string;
  };
  twitter?: {
    card: string;
    title: string;
    description: string;
    image?: string;
  };
  alternates?: {
    languages?: Record<string, string>;
  };
  jsonLd?: object[];
  breadcrumb?: Array<{
    name: string;
    url: string;
  }>;
  seoVersion?: number;
  seoGeneratedAt?: string | null;
  seoGeneratedBy?: string | null;
  seoScore?: number | null;
  qualityScore?: number | null;
  needsReview?: boolean;
  ogTitle?: string;
  ogDescription?: string;
  ogImage?: string;
  twitterTitle?: string;
  twitterDescription?: string;
  robots?: {
    index: boolean;
    follow: boolean;
    archive?: boolean;
    imageIndex?: boolean;
  };
};

type SitemapEntry = {
  url: string;
  lastModified: string;
  changeFrequency: 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never';
  priority: number;
};

const defaultOgImage = 'https://aiverseworld.com/og-image.png';

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function titleCase(value: string) {
  return value
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function truncate(value: string | null | undefined, max = 160) {
  const text = (value ?? '').replace(/\s+/g, ' ').trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trimEnd()}...`;
}

@Injectable()
export class SeoService {
  private readonly siteUrl =
    process.env.AIVERSE_SITE_URL?.trim() ||
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    'https://aiverseworld.com';

  constructor(private readonly prismaService: PrismaService) {}

  async getSeo(input: SeoInput): Promise<SeoPayload> {
    const type = input.type?.trim().toLowerCase();
    if (!type) {
      throw new NotFoundException('SEO type is required.');
    }

    const key = this.keyFor(input);
    const managed = await this.findManagedSeo(type, key);
    if (managed) return managed;

    const generated = await (async () => {
      switch (type) {
      case 'tool':
        return this.getToolSeo(input.slug);
      case 'blog':
        return this.getBlogSeo(input.slug);
      case 'category':
        return this.getCategorySeo(input.slug);
      case 'compare':
        return this.getCompareSeo(input.slug);
      case 'best':
        return this.getBestSeo(input.slug);
      case 'collection':
        return this.getCollectionSeo(input.slug);
      case 'problem':
        return this.getProblemSeo(input.id ?? input.slug);
      case 'search':
        return this.getSearchSeo(input.query);
      default:
        throw new NotFoundException(`Unsupported SEO type: ${type}`);
      }
    })();

    return this.completeSeo(generated);
  }

  async getSitemap(section: string): Promise<SitemapEntry[]> {
    const normalized = section.trim().toLowerCase();
    switch (normalized) {
      case 'tools':
        return this.getToolsSitemap();
      case 'blog':
      case 'blogs':
        return this.getBlogSitemap();
      case 'categories':
        return this.getCategoriesSitemap();
      case 'seo-pages':
      case 'pages':
        return this.getManagedPagesSitemap();
      default:
        throw new NotFoundException(`Unsupported sitemap section: ${section}`);
    }
  }

  private get prisma() {
    const prisma = this.prismaService.getClient();
    if (!prisma) {
      throw new ServiceUnavailableException('SEO persistence is not configured.');
    }
    return prisma;
  }

  private keyFor(input: SeoInput) {
    const value = input.slug ?? input.id ?? input.query ?? 'index';
    return slugify(value) || 'index';
  }

  private canonical(path: string) {
    return new URL(path, this.siteUrl).toString();
  }

  private ogImageFor(input: {
    type: string;
    slug: string;
    title: string;
    description: string;
    kicker?: string;
  }) {
    const url = new URL(`/api/og/${input.type}/${input.slug || 'index'}`, this.siteUrl);
    url.searchParams.set('title', truncate(input.title, 90));
    url.searchParams.set('description', truncate(input.description, 170));
    if (input.kicker) url.searchParams.set('kicker', input.kicker);
    return url.toString();
  }

  private async findManagedSeo(type: string, slug: string): Promise<SeoPayload | null> {
    try {
      const page = await this.prisma.seoPage.findUnique({
        where: { type_slug: { type, slug } },
      });
      if (!page) return null;
      return this.completeSeo({
        title: page.title,
        description: page.description,
        keywords: page.keywords,
        canonical: page.canonicalUrl ?? this.canonical(`/${type}/${slug}`),
        ogTitle: page.ogTitle ?? page.title,
        ogDescription: page.ogDescription ?? page.description,
        ogImage: page.ogImage ?? this.ogImageFor({
          type,
          slug,
          title: page.title,
          description: page.description,
        }),
        twitterTitle: page.twitterTitle ?? page.ogTitle ?? page.title,
        twitterDescription:
          page.twitterDescription ?? page.ogDescription ?? page.description,
        robots: {
          index: page.robotsIndex,
          follow: page.robotsFollow,
          archive: page.robotsArchive,
          imageIndex: page.robotsImageIndex,
        },
        openGraph: {
          title: page.ogTitle ?? page.title,
          description: page.ogDescription ?? page.description,
          image: page.ogImage ?? this.ogImageFor({
            type,
            slug,
            title: page.title,
            description: page.description,
          }),
          type: page.ogType,
        },
        twitter: {
          card: page.twitterCard,
          title: page.twitterTitle ?? page.ogTitle ?? page.title,
          description: page.twitterDescription ?? page.ogDescription ?? page.description,
          image: page.ogImage ?? this.ogImageFor({
            type,
            slug,
            title: page.title,
            description: page.description,
          }),
        },
        alternates: this.objectValue(page.alternates),
        jsonLd: this.objectArrayValue(page.jsonLd),
        breadcrumb: this.breadcrumbValue(page.breadcrumb),
        seoVersion: page.seoVersion,
        seoGeneratedAt: page.seoGeneratedAt?.toISOString() ?? null,
        seoGeneratedBy: page.seoGeneratedBy,
        seoScore: page.seoScore,
        qualityScore: page.qualityScore,
        needsReview: page.needsReview,
      });
    } catch {
      return null;
    }
  }

  private completeSeo(payload: SeoPayload): SeoPayload {
    const ogTitle = payload.openGraph?.title ?? payload.ogTitle ?? payload.title;
    const ogDescription =
      payload.openGraph?.description ?? payload.ogDescription ?? payload.description;
    const ogImage = payload.openGraph?.image ?? payload.ogImage ?? defaultOgImage;
    const twitterTitle = payload.twitter?.title ?? payload.twitterTitle ?? ogTitle;
    const twitterDescription =
      payload.twitter?.description ?? payload.twitterDescription ?? ogDescription;

    return {
      ...payload,
      robots: payload.robots ?? { index: true, follow: true },
      openGraph: payload.openGraph ?? {
        title: ogTitle,
        description: ogDescription,
        image: ogImage,
        type: 'website',
      },
      twitter: payload.twitter ?? {
        card: 'summary_large_image',
        title: twitterTitle,
        description: twitterDescription,
        image: ogImage,
      },
      jsonLd: payload.jsonLd ?? [this.webPageJsonLd(payload.title, payload.description, payload.canonical)],
      breadcrumb: payload.breadcrumb ?? [{ name: 'AiverseWorld', url: this.siteUrl }],
      seoVersion: payload.seoVersion ?? 1,
      seoGeneratedAt: payload.seoGeneratedAt ?? null,
      seoGeneratedBy: payload.seoGeneratedBy ?? 'computed-fallback',
      seoScore: payload.seoScore ?? this.scoreSeo(payload),
      qualityScore: payload.qualityScore ?? null,
      needsReview: payload.needsReview ?? false,
    };
  }

  private async getToolsSitemap(): Promise<SitemapEntry[]> {
    const rows = await this.prisma.aiTool.findMany({
      select: { slug: true, updatedAt: true, lastVerified: true },
      orderBy: { updatedAt: 'desc' },
      take: 50_000,
    });
    return rows.map((tool) => ({
      url: this.canonical(`/tool/${tool.slug}`),
      lastModified: (tool.lastVerified ?? tool.updatedAt).toISOString(),
      changeFrequency: 'weekly',
      priority: 0.8,
    }));
  }

  private async getBlogSitemap(): Promise<SitemapEntry[]> {
    const rows = await this.prisma.blogPost.findMany({
      where: { published: true },
      select: { slug: true, updatedAt: true, publishedAt: true },
      orderBy: { publishedAt: 'desc' },
      take: 50_000,
    });
    return rows.map((post) => ({
      url: this.canonical(`/blog/${post.slug}`),
      lastModified: post.updatedAt.toISOString(),
      changeFrequency: 'weekly',
      priority: 0.75,
    }));
  }

  private async getCategoriesSitemap(): Promise<SitemapEntry[]> {
    const rows = await this.prisma.aiTool.groupBy({
      by: ['category'],
      _max: { updatedAt: true },
    });
    return rows.map((category) => ({
      url: this.canonical(`/category/${slugify(category.category)}`),
      lastModified: (category._max.updatedAt ?? new Date()).toISOString(),
      changeFrequency: 'weekly',
      priority: 0.7,
    }));
  }

  private async getManagedPagesSitemap(): Promise<SitemapEntry[]> {
    const rows = await this.prisma.seoPage.findMany({
      where: { robotsIndex: true },
      select: {
        type: true,
        slug: true,
        canonicalUrl: true,
        updatedAt: true,
      },
      orderBy: { updatedAt: 'desc' },
      take: 50_000,
    });
    return rows.map((page) => ({
      url: page.canonicalUrl ?? this.canonical(`/${page.type}/${page.slug}`),
      lastModified: page.updatedAt.toISOString(),
      changeFrequency: 'weekly',
      priority: 0.65,
    }));
  }

  private webPageJsonLd(title: string, description: string, canonical: string) {
    return {
      '@context': 'https://schema.org',
      '@type': 'WebPage',
      name: title,
      description,
      url: canonical,
      isPartOf: {
        '@type': 'WebSite',
        name: 'AiverseWorld',
        url: this.siteUrl,
      },
    };
  }

  private scoreSeo(payload: SeoPayload) {
    let score = 0;
    if (payload.title.length >= 30 && payload.title.length <= 70) score += 25;
    if (payload.description.length >= 120 && payload.description.length <= 170) score += 25;
    if (payload.keywords.length >= 3) score += 15;
    if (payload.canonical) score += 15;
    if (payload.ogImage || payload.openGraph?.image) score += 10;
    if (payload.robots?.index !== false) score += 10;
    return Math.min(score, 100);
  }

  private objectValue(value: unknown) {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as { languages?: Record<string, string> })
      : undefined;
  }

  private objectArrayValue(value: unknown) {
    return Array.isArray(value) ? (value.filter((item) => item && typeof item === 'object') as object[]) : undefined;
  }

  private breadcrumbValue(value: unknown) {
    if (!Array.isArray(value)) return undefined;
    return value
      .filter((item) => item && typeof item === 'object')
      .map((item) => item as { name?: unknown; url?: unknown })
      .filter((item) => typeof item.name === 'string' && typeof item.url === 'string')
      .map((item) => ({ name: item.name as string, url: item.url as string }));
  }

  private async getToolSeo(slug?: string): Promise<SeoPayload> {
    if (!slug) throw new NotFoundException('Tool slug is required.');
    const tool = await this.prisma.aiTool.findUnique({
      where: { slug },
      select: {
        name: true,
        slug: true,
        category: true,
        company: true,
        shortDescription: true,
        summary: true,
        tags: true,
        seoTitle: true,
        seoDescription: true,
        seoKeywords: true,
        canonicalUrl: true,
        ogImage: true,
      },
    });
    if (!tool) throw new NotFoundException('Tool SEO not found.');

    return {
      title: tool.seoTitle ?? `${tool.name} Review, Pricing & Alternatives | AiverseWorld`,
      description:
        tool.seoDescription ??
        truncate(tool.summary || tool.shortDescription || `Review ${tool.name}, its features, pricing, use cases, and alternatives.`),
      keywords: [
        ...tool.seoKeywords,
        tool.name,
        `${tool.name} review`,
        `${tool.name} alternatives`,
        tool.category,
        tool.company,
      ].filter(Boolean),
      canonical: tool.canonicalUrl ?? this.canonical(`/tool/${tool.slug}`),
      ogTitle: `${tool.name} Review`,
      ogDescription: truncate(tool.shortDescription || tool.summary),
      ogImage: tool.ogImage ?? this.ogImageFor({
        type: 'tool',
        slug: tool.slug,
        title: tool.name,
        description: tool.shortDescription || tool.summary || `${tool.name} review`,
        kicker: tool.category,
      }),
    };
  }

  private async getBlogSeo(slug?: string): Promise<SeoPayload> {
    if (!slug) throw new NotFoundException('Blog slug is required.');
    const post = await this.prisma.blogPost.findFirst({
      where: { slug, published: true },
      select: {
        slug: true,
        title: true,
        description: true,
        category: true,
        tags: true,
        coverImage: true,
        seoTitle: true,
        metaDescription: true,
      },
    });
    if (!post) throw new NotFoundException('Blog SEO not found.');
    const tags = Array.isArray(post.tags) ? post.tags.map(String) : [];
    return {
      title: post.seoTitle ?? post.title,
      description: post.metaDescription ?? truncate(post.description),
      keywords: [post.category, ...tags, 'AI tools', 'artificial intelligence'],
      canonical: this.canonical(`/blog/${post.slug}`),
      ogTitle: post.title,
      ogDescription: truncate(post.description),
      ogImage: this.ogImageFor({
        type: 'blog',
        slug: post.slug,
        title: post.title,
        description: post.description,
        kicker: post.category,
      }),
    };
  }

  private async getCategorySeo(slug?: string): Promise<SeoPayload> {
    if (!slug) throw new NotFoundException('Category slug is required.');
    const categories = await this.prisma.aiTool.groupBy({
      by: ['category'],
      _count: { category: true },
    });
    const category = categories.find((item) => slugify(item.category) === slug);
    const name = category?.category ?? titleCase(slug);
    const count = category?._count.category ?? 0;
    return {
      title: `Best ${name} AI Tools 2026 | AiverseWorld`,
      description: `Compare ${count || 'the best'} ${name} AI tools by features, pricing, use cases, platforms, and workflow fit.`,
      keywords: [name, `${name} AI tools`, 'best AI tools', 'AI software directory'],
      canonical: this.canonical(`/category/${slug}`),
      ogImage: this.ogImageFor({
        type: 'category',
        slug,
        title: `Best ${name} AI Tools`,
        description: `Compare ${count || 'the best'} ${name} AI tools by features, pricing, use cases, platforms, and workflow fit.`,
        kicker: 'AI Category',
      }),
    };
  }

  private async getCompareSeo(slug?: string): Promise<SeoPayload> {
    if (!slug) throw new NotFoundException('Comparison slug is required.');
    const [leftSlug, rightSlug] = slug.split('-vs-');
    const tools = await this.prisma.aiTool.findMany({
      where: { slug: { in: [leftSlug, rightSlug].filter(Boolean) } },
      select: { name: true, slug: true },
    });
    const left = tools.find((tool) => tool.slug === leftSlug)?.name ?? titleCase(leftSlug ?? '');
    const right = tools.find((tool) => tool.slug === rightSlug)?.name ?? titleCase(rightSlug ?? '');
    return {
      title: `${left} vs ${right} | AiverseWorld`,
      description: `Compare ${left} and ${right} across pricing, features, platforms, use cases, strengths, and alternatives.`,
      keywords: [`${left} vs ${right}`, `${left} alternatives`, `${right} alternatives`, 'AI tool comparison'],
      canonical: this.canonical(`/compare/${slug}`),
      ogImage: this.ogImageFor({
        type: 'compare',
        slug,
        title: `${left} vs ${right}`,
        description: `Compare ${left} and ${right} across pricing, features, platforms, use cases, strengths, and alternatives.`,
        kicker: 'AI Comparison',
      }),
    };
  }

  private async getBestSeo(slug?: string): Promise<SeoPayload> {
    if (!slug) throw new NotFoundException('Best-list slug is required.');
    const name = titleCase(slug.replace(/^best-/, 'best '));
    return {
      title: `${name} 2026 | AiverseWorld`,
      description: `Explore a curated ranking of ${name.toLowerCase()} with pricing, features, categories, and practical selection guidance.`,
      keywords: [name, 'best AI tools', 'AI tool rankings', 'AI software'],
      canonical: this.canonical(`/best/${slug}`),
      ogImage: this.ogImageFor({
        type: 'best',
        slug,
        title: name,
        description: `Explore a curated ranking of ${name.toLowerCase()} with pricing, features, categories, and practical selection guidance.`,
        kicker: 'Best AI Tools',
      }),
    };
  }

  private async getCollectionSeo(slug?: string): Promise<SeoPayload> {
    if (!slug) throw new NotFoundException('Collection slug is required.');
    const name = titleCase(slug);
    return {
      title: `${name} AI Tool Collection | AiverseWorld`,
      description: `Browse curated AI tools for ${name.toLowerCase()} workflows, teams, creators, and business use cases.`,
      keywords: [name, 'AI tool collection', 'curated AI tools'],
      canonical: this.canonical(`/collections/${slug}`),
      ogImage: this.ogImageFor({
        type: 'collection',
        slug,
        title: `${name} AI Tool Collection`,
        description: `Browse curated AI tools for ${name.toLowerCase()} workflows, teams, creators, and business use cases.`,
        kicker: 'AI Collection',
      }),
    };
  }

  private async getProblemSeo(id?: string): Promise<SeoPayload> {
    if (!id) throw new NotFoundException('Problem id is required.');
    const problem = await this.prisma.problem.findUnique({
      where: { id },
      select: { id: true, title: true, description: true, industry: true },
    });
    if (!problem) throw new NotFoundException('Problem SEO not found.');
    return {
      title: `${problem.title} | AiverseWorld Problems`,
      description: truncate(problem.description),
      keywords: [problem.title, problem.industry, 'AI business problem', 'AI solution'],
      canonical: this.canonical(`/problems/${problem.id}`),
      ogImage: this.ogImageFor({
        type: 'problem',
        slug: problem.id,
        title: problem.title,
        description: problem.description,
        kicker: problem.industry,
      }),
    };
  }

  private getSearchSeo(query?: string): SeoPayload {
    const q = query?.trim();
    return {
      title: q ? `Search Results for ${q} | AiverseWorld` : 'Search AI Tools | AiverseWorld',
      description: q
        ? `Search AiverseWorld for ${q} across AI tools, categories, pricing models, platforms, and workflow use cases.`
        : 'Search and filter AI tools by category, pricing model, platform, API support, and workflow fit.',
      keywords: q ? [q, 'AI tool search', 'AI software directory'] : ['search AI tools', 'AI tool finder'],
      canonical: this.canonical(q ? `/search?q=${encodeURIComponent(q)}` : '/search'),
      ogImage: this.ogImageFor({
        type: 'search',
        slug: q ? slugify(q) : 'index',
        title: q ? `Search Results for ${q}` : 'Search AI Tools',
        description: q
          ? `Search AiverseWorld for ${q} across AI tools, categories, pricing models, platforms, and workflow use cases.`
          : 'Search and filter AI tools by category, pricing model, platform, API support, and workflow fit.',
        kicker: 'AiverseWorld Search',
      }),
    };
  }
}
