import { BadRequestException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { Prisma, type AiTool } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import type { AdminToolInput, AdminToolUpdateInput, ListToolsInput, ToolSort } from './tools.types';

const categoryDescriptions: Record<string, string> = {
  'ai-assistant': 'General-purpose assistants for writing, coding, reasoning, and productivity.',
  'ai-search': 'Search-oriented AI tools focused on research and cited answers.',
  'productivity-ai': 'Workplace AI tools for docs, planning, office workflows, and meetings.',
  'coding-ai': 'Development tools for code generation, AI IDE workflows, and software delivery.',
  'ai-engineer': 'Autonomous coding systems designed for broader engineering tasks.',
  'image-ai': 'Image generation tools for assets, design, art, and campaign visuals.',
  'design-ai': 'AI-assisted design products for social, brand, and creative work.',
  'video-ai': 'Video generation platforms for social content, creative media, and marketing.',
  'avatar-video-ai': 'Avatar and spokesperson video tools for training and brand communication.',
  'voice-ai': 'Voice synthesis tools for narration, dubbing, and spoken content.',
  'music-ai': 'AI music platforms for songs, jingles, and audio ideation.',
  'audio-ai': 'Audio-first AI products for editing and production workflows.',
  'meeting-ai': 'Meeting assistants for notes, summaries, and transcripts.',
  'research-ai': 'Research tools for knowledge capture, synthesis, and exploration.',
  'writing-ai': 'Writing assistants focused on editing, grammar, and drafting quality.',
  'marketing-ai': 'Growth and copywriting tools for ads, blogs, and campaigns.',
  'presentation-ai': 'Slide and storytelling tools for decks, reports, and presentations.',
  'automation-ai': 'Automation platforms for workflows, integrations, and AI pipelines.',
  'ai-agent': 'Agentic tools for autonomous task execution and operations.',
  'agent-framework': 'Frameworks for orchestrating multiple autonomous agents.',
  'ai-framework': 'Core frameworks for building AI applications and agent systems.',
  'rag-framework': 'Retrieval and knowledge frameworks for RAG systems and search layers.',
  'enterprise-ai': 'Enterprise platforms for deploying, operating, and scaling AI systems.',
};

type BestListDefinition = {
  slug: string;
  title: string;
  description: string;
  eyebrow: string;
};

const bestListDefinitions: BestListDefinition[] = [
  {
    slug: 'top-ai-assistants',
    title: 'Top AI Assistants',
    description: 'The best general-purpose AI assistants for writing, research, coding, and everyday tasks.',
    eyebrow: 'Most Popular',
  },
  {
    slug: 'best-coding-tools',
    title: 'Best AI Coding Tools',
    description: 'Top AI tools for software development, code completion, and developer productivity.',
    eyebrow: 'For Developers',
  },
  {
    slug: 'best-image-generators',
    title: 'Best AI Image Generators',
    description: 'Leading AI image generation tools for art, design, marketing, and creative projects.',
    eyebrow: 'Creative',
  },
  {
    slug: 'best-video-tools',
    title: 'Best AI Video Tools',
    description: 'Top AI video generation and editing platforms for content creators and marketers.',
    eyebrow: 'Video',
  },
  {
    slug: 'best-writing-assistants',
    title: 'Best AI Writing Assistants',
    description: 'AI writing tools for grammar, copywriting, content creation, and editing.',
    eyebrow: 'Writing',
  },
  {
    slug: 'best-meeting-tools',
    title: 'Best AI Meeting Tools',
    description: 'AI assistants for meeting transcription, summaries, and notes.',
    eyebrow: 'Productivity',
  },
  {
    slug: 'best-seo-tools',
    title: 'Best AI SEO Tools',
    description: 'AI-powered SEO tools for keyword research, content optimization, and rankings.',
    eyebrow: 'Marketing',
  },
  {
    slug: 'best-presentation-tools',
    title: 'Best AI Presentation Tools',
    description: 'AI tools for creating slides, decks, and presentations from prompts.',
    eyebrow: 'Design',
  },
  {
    slug: 'free-ai-tools',
    title: 'Best Free AI Tools',
    description: 'Top AI tools with a free plan - no credit card required to get started.',
    eyebrow: 'Free',
  },
  {
    slug: 'open-source-ai-tools',
    title: 'Best Open Source AI Tools',
    description: 'Open source AI tools you can self-host, fork, and customize.',
    eyebrow: 'Open Source',
  },
  {
    slug: 'top-rated-ai-tools',
    title: 'Top Rated AI Tools',
    description: 'The highest rated AI tools based on community reviews and user satisfaction.',
    eyebrow: 'Top Rated',
  },
  {
    slug: 'api-ready-ai-tools',
    title: 'AI Tools with API Access',
    description: 'AI tools with public APIs for developers to integrate into their own products.',
    eyebrow: 'API',
  },
  {
    slug: 'ai-tools-for-students',
    title: 'Best AI Tools for Students',
    description: 'AI tools built for studying, research, writing, and academic productivity.',
    eyebrow: 'For Students',
  },
  {
    slug: 'ai-tools-for-developers',
    title: 'Best AI Tools for Developers',
    description: 'AI coding assistants, developer platforms, and workflow tools for engineers.',
    eyebrow: 'For Developers',
  },
  {
    slug: 'ai-tools-for-marketers',
    title: 'Best AI Tools for Marketers',
    description: 'AI tools for content marketing, SEO, ads, social media, and campaign management.',
    eyebrow: 'For Marketers',
  },
  {
    slug: 'top-10-ai-tools-2025',
    title: 'Top 10 AI Tools in 2025',
    description: 'The most popular and highest rated AI tools of 2025 ranked by usage and reviews.',
    eyebrow: 'Top 10',
  },
  {
    slug: 'best-ai-tools-2026',
    title: 'Best AI Tools in 2026',
    description: 'The top AI tools of 2026 ranked by popularity, ratings, and real-world use cases across every category.',
    eyebrow: '2026',
  },
  {
    slug: 'top-50-ai-tools-for-business',
    title: 'Top 50 AI Tools for Businesses',
    description: 'The best AI tools for business productivity, automation, marketing, customer service, and team collaboration.',
    eyebrow: 'Business',
  },
  {
    slug: 'best-ai-productivity-tools',
    title: 'Best AI Productivity Tools',
    description: 'Top AI tools to supercharge your productivity - from note-taking and meeting assistants to writing and automation.',
    eyebrow: 'Productivity',
  },
  {
    slug: 'best-ai-coding-assistants',
    title: 'Best AI Coding Assistants',
    description: 'Top AI coding tools for developers - from intelligent code completion to full-stack app generators.',
    eyebrow: 'Coding',
  },
  {
    slug: 'best-ai-writing-tools',
    title: 'Best AI Writing Tools',
    description: 'The top AI writing software for content creation, copywriting, grammar checking, and paraphrasing.',
    eyebrow: 'Writing',
  },
  {
    slug: 'best-ai-video-generators',
    title: 'Best AI Video Generators',
    description: 'The best AI video generation tools for content creators, marketers, and businesses in 2026.',
    eyebrow: 'Video',
  },
  {
    slug: 'best-ai-marketing-tools',
    title: 'Best AI Marketing Tools',
    description: 'Top AI tools for digital marketing - covering SEO, ads, content, social media, and campaign management.',
    eyebrow: 'Marketing',
  },
  {
    slug: 'chatgpt-alternatives',
    title: 'Best ChatGPT Alternatives',
    description: 'The top alternatives to ChatGPT including Claude, Gemini, Grok, Perplexity, and more.',
    eyebrow: 'Alternatives',
  },
  {
    slug: 'best-ai-research-tools',
    title: 'Best AI Research Tools',
    description: 'Top AI tools for research, literature review, note-taking, and academic productivity.',
    eyebrow: 'Research',
  },
  {
    slug: 'best-ai-image-generators',
    title: 'Best AI Image Generators',
    description: 'Leading AI image generation tools for art, design, marketing, and creative projects.',
    eyebrow: 'Images',
  },
  {
    slug: 'best-ai-presentation-tools',
    title: 'Best AI Presentation Tools',
    description: 'Top AI tools for creating slides, decks, and presentations from prompts in minutes.',
    eyebrow: 'Presentations',
  },
  {
    slug: 'best-ai-automation-tools',
    title: 'Best AI Automation Tools',
    description: 'Top AI automation platforms for workflows, integrations, and business process automation.',
    eyebrow: 'Automation',
  },
];

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function cleanString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function asStringArray(value: Prisma.JsonValue | null | undefined): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function inputStringArray(value: unknown, fallback: string[] = []) {
  if (!Array.isArray(value)) {
    return fallback;
  }

  return value
    .map((item) => cleanString(item))
    .filter(Boolean);
}

function jsonArrayOrNull(value: string[] | undefined | null) {
  return value && value.length > 0 ? value : Prisma.JsonNull;
}

function clampNumber(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function normalizeTool(tool: {
  id: string;
  rank: number | null;
  name: string;
  slug: string;
  category: string;
  subcategory: string;
  company: string;
  website: string;
  domain: string;
  favicon: string;
  logoUrl: string | null;
  freePlan: string;
  freeTrial: boolean;
  pricingModel: string;
  startingPriceUsd: number | null;
  pricingNotes: string | null;
  shortDescription: string;
  summary: string | null;
  features: Prisma.JsonValue;
  bestFor: Prisma.JsonValue;
  targetAudience: Prisma.JsonValue;
  tags: Prisma.JsonValue;
  aiType: Prisma.JsonValue;
  modalities: Prisma.JsonValue;
  modelProvider: Prisma.JsonValue;
  modelNames: Prisma.JsonValue | null;
  apiAvailable: boolean;
  openSource: boolean;
  deploymentType: Prisma.JsonValue;
  platforms: Prisma.JsonValue;
  integrations: Prisma.JsonValue | null;
  teamCollaboration: boolean | null;
  security: Prisma.JsonValue | null;
  privacyNotes: string | null;
  popularityScore: number | null;
  rating: number | null;
  reviewCount: number | null;
  status: string;
  launchYear: number | null;
  lastVerified: Date | null;
  sourceUrl: string;
  sourceType: string;
}) {
  return {
    id: tool.id,
    rank: tool.rank ?? 0,
    name: tool.name,
    slug: tool.slug,
    category: tool.category,
    subcategory: tool.subcategory,
    company: tool.company,
    website: tool.website,
    domain: tool.domain,
    favicon: tool.favicon,
    logoUrl: tool.logoUrl ?? undefined,
    freePlan: tool.freePlan,
    freeTrial: tool.freeTrial,
    pricingModel: tool.pricingModel,
    startingPriceUsd: tool.startingPriceUsd,
    pricingNotes: tool.pricingNotes ?? undefined,
    shortDescription: tool.shortDescription,
    summary: tool.summary ?? undefined,
    features: asStringArray(tool.features),
    bestFor: asStringArray(tool.bestFor),
    targetAudience: asStringArray(tool.targetAudience),
    tags: asStringArray(tool.tags),
    aiType: asStringArray(tool.aiType),
    modalities: asStringArray(tool.modalities),
    modelProvider: asStringArray(tool.modelProvider),
    modelNames: asStringArray(tool.modelNames),
    apiAvailable: tool.apiAvailable,
    openSource: tool.openSource,
    deploymentType: asStringArray(tool.deploymentType),
    platforms: asStringArray(tool.platforms),
    integrations: asStringArray(tool.integrations),
    teamCollaboration: tool.teamCollaboration ?? undefined,
    security: asStringArray(tool.security),
    privacyNotes: tool.privacyNotes ?? undefined,
    popularityScore: tool.popularityScore ?? undefined,
    rating: tool.rating ?? undefined,
    reviewCount: tool.reviewCount ?? undefined,
    status: tool.status,
    launchYear: tool.launchYear ?? undefined,
    lastVerified: tool.lastVerified?.toISOString().slice(0, 10) ?? '',
    sourceUrl: tool.sourceUrl,
    sourceType: tool.sourceType,
  };
}

function isToolSort(value: string): value is ToolSort {
  return ['rank', 'popular', 'rating', 'newest'].includes(value);
}

function tokenize(value: string) {
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 1);
}

function buildToolSearchText(input: {
  name: string;
  company: string;
  category: string;
  subcategory: string;
  shortDescription: string;
  summary?: string | null;
  pricingModel: string;
  freePlan: string;
  features: string[];
  bestFor: string[];
  targetAudience: string[];
  tags: string[];
  aiType: string[];
  modalities: string[];
  modelProvider: string[];
  modelNames?: string[] | null;
  deploymentType: string[];
  platforms: string[];
  integrations?: string[] | null;
}) {
  return [
    input.name,
    input.company,
    input.category,
    input.subcategory,
    input.shortDescription,
    input.summary,
    input.pricingModel,
    input.freePlan,
    input.features.join(' '),
    input.bestFor.join(' '),
    input.targetAudience.join(' '),
    input.tags.join(' '),
    input.aiType.join(' '),
    input.modalities.join(' '),
    input.modelProvider.join(' '),
    input.modelNames?.join(' '),
    input.deploymentType.join(' '),
    input.platforms.join(' '),
    input.integrations?.join(' '),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

@Injectable()
export class ToolsService {
  constructor(private readonly prismaService: PrismaService) {}

  private getPrisma() {
    const prisma = this.prismaService.getClient();

    if (!prisma) {
      throw new ServiceUnavailableException('Tool catalog persistence is not configured.');
    }

    return prisma;
  }

  async list(input: ListToolsInput) {
    const page = clampNumber(input.page, 1, 10_000);
    const limit = clampNumber(input.limit, 1, 100);
    const where = this.buildWhere(input);
    const orderBy = this.buildOrderBy(input.sort);
    const prisma = this.getPrisma();

    const [total, tools, categories] = await Promise.all([
      prisma.aiTool.count({ where }),
      prisma.aiTool.findMany({
        where,
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.aiTool.findMany({
        distinct: ['category'],
        orderBy: { category: 'asc' },
        select: { category: true },
      }),
    ]);

    return {
      data: tools.map(normalizeTool),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
      filters: {
        categories: categories.map((item) => item.category),
      },
    };
  }

  async recommend(query: string, limit = 8) {
    const normalizedQuery = query.trim();

    if (!normalizedQuery) {
      return this.list({
        page: 1,
        limit,
        sort: 'popular',
      });
    }

    const candidates = await this.getPrisma().aiTool.findMany({
      where: this.buildWhere({ page: 1, limit, search: normalizedQuery, sort: 'popular' }),
      take: 80,
      orderBy: [{ popularityScore: 'desc' }, { rating: 'desc' }, { rank: 'asc' }],
    });

    const tokens = tokenize(normalizedQuery);
    const scored = candidates
      .map((tool) => {
        const haystack = tool.searchText.toLowerCase();
        const exactBoost = haystack.includes(normalizedQuery.toLowerCase()) ? 20 : 0;
        const tokenScore = tokens.reduce((score, token) => score + (haystack.includes(token) ? 10 : 0), 0);
        const qualityScore = (tool.popularityScore ?? 0) / 10 + (tool.rating ?? 0);

        return {
          tool,
          score: exactBoost + tokenScore + qualityScore,
        };
      })
      .sort((left, right) => right.score - left.score)
      .slice(0, clampNumber(limit, 1, 20));

    return {
      query: normalizedQuery,
      data: scored.map(({ tool, score }) => ({
        ...normalizeTool(tool),
        recommendation: {
          score: Math.round(score),
          reason: this.buildReason(tool, tokens),
        },
      })),
    };
  }

  async getBySlug(slug: string) {
    const tool = await this.getPrisma().aiTool.findUnique({
      where: { slug },
    });

    if (!tool) {
      throw new NotFoundException('AI tool not found.');
    }

    return normalizeTool(tool);
  }

  async getById(id: string) {
    const tool = await this.getPrisma().aiTool.findUnique({
      where: { id },
    });

    if (!tool) {
      throw new NotFoundException('AI tool not found.');
    }

    return normalizeTool(tool);
  }

  async upsertAdminTool(input: AdminToolInput) {
    const prisma = this.getPrisma();
    const data = this.buildAdminToolCreateData(input);
    const source = await this.getOrCreateAdminSource(
      input.sourceName,
      input.sourceType,
      input.sourceUrl,
    );
    const { slug: _slug, ...updateData } = data;

    const tool = await prisma.aiTool.upsert({
      where: { slug: data.slug },
      update: {
        ...updateData,
        sourceId: source.id,
      },
      create: {
        ...data,
        sourceId: source.id,
      },
    });

    return tool;
  }

  async updateAdminTool(id: string, input: AdminToolUpdateInput) {
    const prisma = this.getPrisma();
    const existing = await prisma.aiTool.findUnique({ where: { id } });

    if (!existing) {
      throw new NotFoundException('AI tool not found.');
    }

    const data = this.buildAdminToolUpdateData(existing, input);
    const source =
      input.sourceName || input.sourceType
        ? await this.getOrCreateAdminSource(input.sourceName, input.sourceType, input.sourceUrl)
        : null;

    const tool = await prisma.aiTool.update({
      where: { id },
      data: {
        ...data,
        ...(source ? { sourceId: source.id } : {}),
      },
    });

    return tool;
  }

  async getCategories() {
    const tools = await this.getPrisma().aiTool.groupBy({
      by: ['category'],
      _count: { category: true },
      orderBy: { category: 'asc' },
    });

    return {
      data: tools.map((item) => {
        const slug = slugify(item.category);
        return {
          name: item.category,
          slug,
          count: item._count.category,
          description:
            categoryDescriptions[slug] ||
            `${item.category} tools curated for practical business use cases.`,
        };
      }),
    };
  }

  async getCategory(slug: string, pageInput = 1, limitInput = 24) {
    const page = clampNumber(pageInput, 1, 10_000);
    const limit = clampNumber(limitInput, 1, 100);
    const categories = await this.getCategories();
    const category = categories.data.find((item) => item.slug === slug);

    if (!category) {
      throw new NotFoundException('AI tool category not found.');
    }

    const where: Prisma.AiToolWhereInput = {
      category: { equals: category.name, mode: 'insensitive' },
    };
    const [total, tools] = await Promise.all([
      this.getPrisma().aiTool.count({ where }),
      this.getPrisma().aiTool.findMany({
        where,
        orderBy: this.buildOrderBy('popular'),
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return {
      data: category,
      tools: tools.map(normalizeTool),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }

  getBestLists() {
    return {
      data: bestListDefinitions,
    };
  }

  async getBestList(slug: string, pageInput = 1, limitInput = 24) {
    const page = clampNumber(pageInput, 1, 10_000);
    const limit = clampNumber(limitInput, 1, 100);
    const list = bestListDefinitions.find((item) => item.slug === slug);

    if (!list) {
      throw new NotFoundException('Best list not found.');
    }

    const where = this.buildBestListWhere(slug);
    const maxItems = slug === 'top-10-ai-tools-2025' ? 10 : slug === 'top-50-ai-tools-for-business' ? 50 : null;
    const [rawTotal, tools] = await Promise.all([
      this.getPrisma().aiTool.count({ where }),
      this.getPrisma().aiTool.findMany({
        where,
        orderBy: this.buildOrderBy(slug === 'top-rated-ai-tools' ? 'rating' : 'popular'),
        skip: (page - 1) * limit,
        take: maxItems ? Math.min(limit, Math.max(0, maxItems - (page - 1) * limit)) : limit,
      }),
    ]);
    const total = maxItems ? Math.min(rawTotal, maxItems) : rawTotal;

    return {
      data: list,
      tools: tools.map(normalizeTool),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }

  async getComparisons(limit = 120) {
    const tools = await this.getPrisma().aiTool.findMany({
      orderBy: this.buildOrderBy('popular'),
      take: clampNumber(limit, 2, 200),
    });
    const pairs: Array<{ slug: string; title: string; summary: string }> = [];

    for (let index = 0; index < tools.length; index += 1) {
      const left = tools[index];
      const right =
        tools.find((tool) => tool.slug !== left.slug && tool.category === left.category) ||
        tools[index + 1];

      if (!right || right.slug === left.slug) {
        continue;
      }

      const slug = `${left.slug}-vs-${right.slug}`;
      if (pairs.some((pair) => pair.slug === slug)) {
        continue;
      }

      pairs.push({
        slug,
        title: `${left.name} vs ${right.name}`,
        summary: `Compare ${left.name} and ${right.name} across pricing, features, platforms, and use cases.`,
      });
    }

    return {
      data: pairs,
    };
  }

  async getComparison(slug: string) {
    const vsIndex = slug.indexOf('-vs-');

    if (vsIndex < 1) {
      throw new NotFoundException('Comparison not found.');
    }

    const leftSlug = slug.slice(0, vsIndex);
    const rightSlug = slug.slice(vsIndex + 4);
    const [left, right] = await Promise.all([
      this.getPrisma().aiTool.findUnique({ where: { slug: leftSlug } }),
      this.getPrisma().aiTool.findUnique({ where: { slug: rightSlug } }),
    ]);

    if (!left || !right) {
      throw new NotFoundException('Comparison not found.');
    }

    return {
      data: {
        slug,
        title: `${left.name} vs ${right.name}`,
        summary: `Compare ${left.name} and ${right.name} across pricing, features, platforms, and use cases.`,
      },
      left: normalizeTool(left),
      right: normalizeTool(right),
    };
  }

  async getComparisonByIds(leftId: string, rightId: string) {
    if (!leftId || !rightId || leftId === rightId) {
      throw new NotFoundException('Comparison not found.');
    }

    const [left, right] = await Promise.all([
      this.getPrisma().aiTool.findUnique({ where: { id: leftId } }),
      this.getPrisma().aiTool.findUnique({ where: { id: rightId } }),
    ]);

    if (!left || !right) {
      throw new NotFoundException('Comparison not found.');
    }

    const slug = `${left.slug}-vs-${right.slug}`;

    return {
      data: {
        slug,
        title: `${left.name} vs ${right.name}`,
        summary: `Compare ${left.name} and ${right.name} across pricing, features, platforms, and use cases.`,
      },
      left: normalizeTool(left),
      right: normalizeTool(right),
    };
  }

  normalizeSort(value?: string): ToolSort {
    return value && isToolSort(value) ? value : 'rank';
  }

  normalizeToolForResponse(tool: Parameters<typeof normalizeTool>[0]) {
    return normalizeTool(tool);
  }

  private async getOrCreateAdminSource(name?: string, type?: string, baseUrl?: string | null) {
    const prisma = this.getPrisma();
    const sourceName = cleanString(name) || 'admin-api';

    return prisma.aiToolSource.upsert({
      where: { name: sourceName },
      update: {
        type: cleanString(type) || 'admin-api',
        baseUrl: baseUrl ?? null,
        isActive: true,
        lastSyncedAt: new Date(),
      },
      create: {
        name: sourceName,
        type: cleanString(type) || 'admin-api',
        baseUrl: baseUrl ?? null,
        isActive: true,
        lastSyncedAt: new Date(),
      },
    });
  }

  private buildAdminToolCreateData(input: AdminToolInput): Prisma.AiToolUncheckedCreateInput {
    const name = cleanString(input.name);
    const category = cleanString(input.category);
    const shortDescription = cleanString(input.shortDescription);

    if (!name || !category || !shortDescription) {
      throw new BadRequestException('name, category, and shortDescription are required.');
    }

    const slug = cleanString(input.slug) || slugify(name);
    const company = cleanString(input.company) || name;
    const website = cleanString(input.website) || cleanString(input.sourceUrl) || '';
    const domain = cleanString(input.domain) || this.extractDomain(website);
    const subcategory = cleanString(input.subcategory) || category;
    const pricingModel = cleanString(input.pricingModel) || 'Unknown';
    const freePlan = cleanString(input.freePlan) || 'Unknown';
    const features = inputStringArray(input.features);
    const bestFor = inputStringArray(input.bestFor);
    const targetAudience = inputStringArray(input.targetAudience);
    const tags = inputStringArray(input.tags);
    const aiType = inputStringArray(input.aiType);
    const modalities = inputStringArray(input.modalities);
    const modelProvider = inputStringArray(input.modelProvider);
    const modelNames = inputStringArray(input.modelNames);
    const deploymentType = inputStringArray(input.deploymentType);
    const platforms = inputStringArray(input.platforms);
    const integrations = inputStringArray(input.integrations);

    const searchText = buildToolSearchText({
      name,
      company,
      category,
      subcategory,
      shortDescription,
      summary: input.summary ?? null,
      pricingModel,
      freePlan,
      features,
      bestFor,
      targetAudience,
      tags,
      aiType,
      modalities,
      modelProvider,
      modelNames,
      deploymentType,
      platforms,
      integrations,
    });

    return {
      rank: input.rank ?? null,
      name,
      slug,
      category,
      subcategory,
      company,
      website,
      domain,
      favicon: cleanString(input.favicon) || (domain ? `https://www.google.com/s2/favicons?domain=${domain}&sz=64` : ''),
      logoUrl: input.logoUrl ?? null,
      freePlan,
      freeTrial: input.freeTrial ?? false,
      pricingModel,
      startingPriceUsd: input.startingPriceUsd ?? null,
      pricingNotes: input.pricingNotes ?? null,
      shortDescription,
      summary: input.summary ?? null,
      features,
      bestFor,
      targetAudience,
      tags,
      aiType,
      modalities,
      modelProvider,
      modelNames: jsonArrayOrNull(modelNames),
      apiAvailable: input.apiAvailable ?? false,
      openSource: input.openSource ?? false,
      deploymentType,
      platforms,
      integrations: jsonArrayOrNull(integrations),
      teamCollaboration: input.teamCollaboration ?? null,
      security: jsonArrayOrNull(inputStringArray(input.security)),
      privacyNotes: input.privacyNotes ?? null,
      popularityScore: input.popularityScore ?? null,
      rating: input.rating ?? null,
      reviewCount: input.reviewCount ?? null,
      status: cleanString(input.status) || 'Active',
      launchYear: input.launchYear ?? null,
      lastVerified: input.lastVerified ? new Date(`${input.lastVerified}T00:00:00.000Z`) : null,
      sourceUrl: cleanString(input.sourceUrl) || website,
      sourceType: cleanString(input.sourceType) || 'admin-api',
      searchText,
    };
  }

  private buildAdminToolUpdateData(
    existing: AiTool,
    input: AdminToolUpdateInput,
  ): Prisma.AiToolUncheckedUpdateInput {
    const current = normalizeTool(existing);
    const merged: AdminToolInput = {
      ...current,
      ...input,
      name: input.name ?? current.name,
      category: input.category ?? current.category,
      shortDescription: input.shortDescription ?? current.shortDescription,
      features: input.features ?? current.features,
      bestFor: input.bestFor ?? current.bestFor,
      targetAudience: input.targetAudience ?? current.targetAudience,
      tags: input.tags ?? current.tags,
      aiType: input.aiType ?? current.aiType,
      modalities: input.modalities ?? current.modalities,
      modelProvider: input.modelProvider ?? current.modelProvider,
      deploymentType: input.deploymentType ?? current.deploymentType,
      platforms: input.platforms ?? current.platforms,
    };

    return this.buildAdminToolCreateData(merged);
  }

  private buildWhere(input: Partial<ListToolsInput>): Prisma.AiToolWhereInput {
    const where: Prisma.AiToolWhereInput = {};

    if (input.category) {
      where.category = { equals: input.category, mode: 'insensitive' };
    }

    if (input.pricing) {
      where.pricingModel = { equals: input.pricing, mode: 'insensitive' };
    }

    if (input.platform) {
      where.searchText = { contains: input.platform, mode: 'insensitive' };
    }

    if (input.freeOnly) {
      where.freePlan = 'Yes';
    }

    if (input.apiOnly) {
      where.apiAvailable = true;
    }

    if (input.openSourceOnly) {
      where.openSource = true;
    }

    if (input.search) {
      where.OR = [
        { name: { contains: input.search, mode: 'insensitive' } },
        { company: { contains: input.search, mode: 'insensitive' } },
        { category: { contains: input.search, mode: 'insensitive' } },
        { subcategory: { contains: input.search, mode: 'insensitive' } },
        { shortDescription: { contains: input.search, mode: 'insensitive' } },
        { summary: { contains: input.search, mode: 'insensitive' } },
        { searchText: { contains: input.search, mode: 'insensitive' } },
      ];
    }

    return where;
  }

  private buildOrderBy(sort: ToolSort): Prisma.AiToolOrderByWithRelationInput[] {
    if (sort === 'popular') {
      return [{ popularityScore: 'desc' }, { rank: 'asc' }];
    }

    if (sort === 'rating') {
      return [{ rating: 'desc' }, { reviewCount: 'desc' }, { rank: 'asc' }];
    }

    if (sort === 'newest') {
      return [{ updatedAt: 'desc' }, { rank: 'asc' }];
    }

    return [{ rank: 'asc' }, { popularityScore: 'desc' }];
  }

  private buildBestListWhere(slug: string): Prisma.AiToolWhereInput {
    const categoryIn = (...categories: string[]) => ({ category: { in: categories } });
    const searchHas = (...terms: string[]) => ({
      OR: terms.map((term) => ({ searchText: { contains: term, mode: 'insensitive' as const } })),
    });

    if (slug === 'top-ai-assistants') return { category: 'AI Assistant' };
    if (slug === 'best-coding-tools') return { category: 'Coding Assistant' };
    if (slug === 'best-image-generators' || slug === 'best-ai-image-generators') {
      return categoryIn('Image Generation', 'Image Enhancement');
    }
    if (slug === 'best-video-tools' || slug === 'best-ai-video-generators') {
      return categoryIn('Video Generation', 'Video', 'Audio/Video');
    }
    if (slug === 'best-writing-assistants' || slug === 'best-ai-writing-tools') {
      return {
        OR: [{ category: 'Writing Assistant' }, ...searchHas('writing', 'copywriting', 'grammar', 'content').OR],
      };
    }
    if (slug === 'best-meeting-tools') return { category: 'Meeting Assistant' };
    if (slug === 'best-seo-tools') return { category: 'SEO' };
    if (slug === 'best-presentation-tools' || slug === 'best-ai-presentation-tools') {
      return categoryIn('Presentation', 'Document Generation');
    }
    if (slug === 'free-ai-tools') return { freePlan: 'Yes' };
    if (slug === 'open-source-ai-tools') return { openSource: true };
    if (slug === 'top-rated-ai-tools') return { rating: { gte: 4.4 } };
    if (slug === 'api-ready-ai-tools') return { apiAvailable: true };
    if (slug === 'ai-tools-for-students') return { searchText: { contains: 'student', mode: 'insensitive' } };
    if (slug === 'ai-tools-for-developers' || slug === 'best-ai-coding-assistants') {
      return searchHas('developer', 'coding', 'code', 'fullstack');
    }
    if (slug === 'ai-tools-for-marketers' || slug === 'best-ai-marketing-tools') {
      return { OR: [{ category: 'Marketing' }, { category: 'SEO' }, ...searchHas('marketer').OR] };
    }
    if (slug === 'top-50-ai-tools-for-business') return { popularityScore: { gte: 60 } };
    if (slug === 'best-ai-productivity-tools') {
      return categoryIn('AI Assistant', 'Meeting Assistant', 'Note-taking', 'Automation', 'Documentation', 'Writing Assistant');
    }
    if (slug === 'chatgpt-alternatives') {
      return { category: 'AI Assistant', NOT: { slug: 'chatgpt' } };
    }
    if (slug === 'best-ai-research-tools') {
      return { OR: [{ category: 'Research' }, { category: 'Note-taking' }, ...searchHas('research', 'academic', 'papers').OR] };
    }
    if (slug === 'best-ai-automation-tools') return categoryIn('Automation', 'AI Agent');

    return {};
  }

  private buildReason(tool: { category: string; bestFor: Prisma.JsonValue; tags: Prisma.JsonValue }, tokens: string[]) {
    const bestFor = asStringArray(tool.bestFor);
    const tags = asStringArray(tool.tags);
    const matched = [...bestFor, ...tags, tool.category].find((item) =>
      tokens.some((token) => item.toLowerCase().includes(token)),
    );

    return matched
      ? `Matched your request against ${matched}.`
      : `Strong ${tool.category} fit based on catalog ranking and usage signals.`;
  }

  private extractDomain(value: string) {
    if (!value) {
      return '';
    }

    try {
      return new URL(value).hostname.replace(/^www\./, '');
    } catch {
      return value.replace(/^https?:\/\//, '').split('/')[0].replace(/^www\./, '');
    }
  }
}
