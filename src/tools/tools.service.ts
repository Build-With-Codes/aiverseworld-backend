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

function cleanSummary(value: unknown) {
  if (Array.isArray(value)) {
    const paragraphs = value
      .map((item) => cleanString(item))
      .filter(Boolean);

    return paragraphs.length > 0 ? paragraphs.join('\n\n') : null;
  }

  return cleanString(value) || null;
}

function truncateSeo(value: string, length: number) {
  const cleaned = value.replace(/\s+/g, ' ').trim();
  return cleaned.length > length ? cleaned.slice(0, length - 1).trimEnd() : cleaned;
}

function uniqueSeoKeywords(values: string[]) {
  return values
    .map((value) => value.trim())
    .filter(Boolean)
    .filter((value, index, array) => array.findIndex((item) => item.toLowerCase() === value.toLowerCase()) === index)
    .slice(0, 12);
}

function buildToolSeo(input: {
  name: string;
  slug: string;
  shortDescription: string;
  summary: string | null;
  category: string;
  company: string;
  tags: string[];
  aiType: string[];
  modelProvider: string[];
  seoTitle?: string | null;
  seoDescription?: string | null;
  seoKeywords?: string[];
  canonicalUrl?: string | null;
  ogImage?: string | null;
  favicon?: string | null;
}) {
  const siteUrl = (process.env.PUBLIC_SITE_URL ?? 'https://aiverseworld.com').replace(/\/+$/, '');
  const title = truncateSeo(
    cleanString(input.seoTitle) || `${input.name} Review, Pricing & Alternatives | AiverseWorld`,
    60,
  );
  const description = truncateSeo(
    cleanString(input.seoDescription) ||
      input.summary ||
      `${input.shortDescription} Compare ${input.name} features, pricing, use cases, and alternatives on AiverseWorld.`,
    160,
  );
  const keywords = uniqueSeoKeywords([
    ...(input.seoKeywords ?? []),
    input.name,
    `${input.name} review`,
    `${input.name} pricing`,
    `${input.name} alternatives`,
    input.category,
    input.company,
    ...input.tags,
    ...input.aiType,
    ...input.modelProvider,
  ]);

  return {
    title,
    description,
    keywords,
    canonical: cleanString(input.canonicalUrl) || `${siteUrl}/tool/${input.slug}`,
    ogImage: cleanString(input.ogImage) || input.favicon || `${siteUrl}/logo.webp`,
  };
}

function asStringArray(value: Prisma.JsonValue | null | undefined): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function asQaPairArray(
  value: Prisma.JsonValue | null | undefined,
): { question: string; answer: string }[] {
  if (!Array.isArray(value)) return [];

  return value.filter(
    (item): item is { question: string; answer: string } =>
      typeof item === 'object' &&
      item !== null &&
      typeof (item as Record<string, unknown>).question === 'string' &&
      typeof (item as Record<string, unknown>).answer === 'string',
  );
}

function asFeatureNoteArray(
  value: Prisma.JsonValue | null | undefined,
): { feature: string; benefit: string }[] {
  if (!Array.isArray(value)) return [];

  return value.filter(
    (item): item is { feature: string; benefit: string } =>
      typeof item === 'object' &&
      item !== null &&
      typeof (item as Record<string, unknown>).feature === 'string' &&
      typeof (item as Record<string, unknown>).benefit === 'string',
  );
}

function inputStringArray(value: unknown, fallback: string[] = []) {
  if (!Array.isArray(value)) {
    return fallback;
  }

  return value
    .map((item) => cleanString(item))
    .filter(Boolean);
}

function inputQaPairArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (typeof item !== 'object' || item === null) return null;
      const record = item as Record<string, unknown>;
      const question = cleanString(record.question);
      const answer = cleanString(record.answer);

      return question && answer ? { question, answer } : null;
    })
    .filter((item): item is { question: string; answer: string } => Boolean(item));
}

function inputFeatureNoteArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (typeof item !== 'object' || item === null) return null;
      const record = item as Record<string, unknown>;
      const feature = cleanString(record.feature);
      const benefit = cleanString(record.benefit);

      return feature && benefit ? { feature, benefit } : null;
    })
    .filter((item): item is { feature: string; benefit: string } => Boolean(item));
}

function jsonArrayOrNull(value: string[] | undefined | null) {
  return value && value.length > 0 ? value : Prisma.JsonNull;
}

function jsonObjectArrayOrNull<T extends Record<string, string>>(value: T[]) {
  return value.length > 0 ? value : Prisma.JsonNull;
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
  prosJson: Prisma.JsonValue | null;
  consJson: Prisma.JsonValue | null;
  editorialVerdict: string | null;
  alternativesNote: string | null;
  faqsJson: Prisma.JsonValue | null;
  featureNotesJson: Prisma.JsonValue | null;
  seoTitle: string | null;
  seoDescription: string | null;
  seoKeywords: string[];
  canonicalUrl: string | null;
  ogImage: string | null;
}) {
  const seo = buildToolSeo({
    name: tool.name,
    slug: tool.slug,
    shortDescription: tool.shortDescription,
    summary: tool.summary,
    category: tool.category,
    company: tool.company,
    tags: asStringArray(tool.tags),
    aiType: asStringArray(tool.aiType),
    modelProvider: asStringArray(tool.modelProvider),
    seoTitle: tool.seoTitle,
    seoDescription: tool.seoDescription,
    seoKeywords: tool.seoKeywords,
    canonicalUrl: tool.canonicalUrl,
    ogImage: tool.ogImage,
    favicon: tool.logoUrl ?? tool.favicon,
  });

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
    pros: asStringArray(tool.prosJson),
    cons: asStringArray(tool.consJson),
    editorialVerdict: tool.editorialVerdict ?? undefined,
    alternativesNote: tool.alternativesNote ?? undefined,
    faqs: asQaPairArray(tool.faqsJson),
    featureNotes: asFeatureNoteArray(tool.featureNotesJson),
    seo,
  };
}

function isToolSort(value: string): value is ToolSort {
  return ['rank', 'popular', 'rating', 'newest'].includes(value);
}

const recommendationStopWords = new Set([
  'ai',
  'an',
  'and',
  'app',
  'apps',
  'best',
  'for',
  'get',
  'give',
  'help',
  'i',
  'me',
  'need',
  'of',
  'on',
  'or',
  'please',
  'recommend',
  'show',
  'the',
  'to',
  'tool',
  'tools',
  'use',
  'want',
  'with',
]);

function normalizeRecommendationQuery(value: string) {
  return value
    .toLowerCase()
    .replace(/\bvidoe\b/g, 'video')
    .replace(/\bgeneratoe\b/g, 'generator')
    .replace(/\bgenerater\b/g, 'generator')
    .replace(/\bgenrator\b/g, 'generator')
    .replace(/\bpdfs\b/g, 'pdf')
    .replace(/\bdocs\b/g, 'documents');
}

function tokenize(value: string) {
  const tokens = normalizeRecommendationQuery(value)
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 1 && !recommendationStopWords.has(token));

  return Array.from(
    new Set(tokens.flatMap((token) => (token.endsWith('s') && token.length > 3 ? [token, token.slice(0, -1)] : [token]))),
  );
}

function levenshteinDistance(left: string, right: string) {
  if (left === right) return 0;
  if (!left) return right.length;
  if (!right) return left.length;

  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  const current = Array.from({ length: right.length + 1 }, () => 0);

  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    current[0] = leftIndex;

    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const substitutionCost = left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1;
      current[rightIndex] = Math.min(
        previous[rightIndex] + 1,
        current[rightIndex - 1] + 1,
        previous[rightIndex - 1] + substitutionCost,
      );
    }

    previous.splice(0, previous.length, ...current);
  }

  return previous[right.length];
}

function fuzzySimilarity(left: string, right: string) {
  const normalizedLeft = left.toLowerCase();
  const normalizedRight = right.toLowerCase();
  const maxLength = Math.max(normalizedLeft.length, normalizedRight.length);

  if (maxLength === 0) return 1;

  return 1 - levenshteinDistance(normalizedLeft, normalizedRight) / maxLength;
}

function searchableWords(tool: AiTool) {
  return Array.from(
    new Set(
      [
        tool.name,
        tool.slug,
        tool.company,
        tool.domain,
        tool.category,
        tool.subcategory,
        ...tool.searchText.split(/[^a-z0-9.]+/),
      ]
        .map((value) => value.toLowerCase().trim())
        .filter((value) => value.length > 2),
    ),
  );
}

function fuzzyToolScore(tool: AiTool, query: string, tokens: string[]) {
  const normalizedQuery = query.toLowerCase();
  const haystack = tool.searchText.toLowerCase();
  const words = searchableWords(tool);
  const exactBoost = haystack.includes(normalizedQuery) ? 35 : 0;
  const tokenScore = tokens.reduce((score, token) => {
    if (haystack.includes(token)) return score + 20;

    const bestSimilarity = Math.max(...words.map((word) => fuzzySimilarity(token, word)), 0);
    return score + bestSimilarity * 18;
  }, 0);
  const qualityScore = (tool.popularityScore ?? 0) / 20 + (tool.rating ?? 0);

  return exactBoost + tokenScore + qualityScore;
}

function buildToolSearchText(input: {
  name: string;
  company: string;
  website: string;
  domain: string;
  category: string;
  subcategory: string;
  shortDescription: string;
  summary?: string | null;
  pricingModel: string;
  startingPriceUsd?: number | null;
  pricingNotes?: string | null;
  freePlan: string;
  freeTrial?: boolean;
  features: string[];
  bestFor: string[];
  targetAudience: string[];
  tags: string[];
  aiType: string[];
  modalities: string[];
  modelProvider: string[];
  modelNames?: string[] | null;
  apiAvailable?: boolean;
  openSource?: boolean;
  deploymentType: string[];
  platforms: string[];
  integrations?: string[] | null;
  teamCollaboration?: boolean | null;
  security?: string[] | null;
  privacyNotes?: string | null;
  status?: string;
  launchYear?: number | null;
  sourceUrl?: string;
  sourceType?: string;
  pros?: string[];
  cons?: string[];
  editorialVerdict?: string | null;
  alternativesNote?: string | null;
  faqs?: { question: string; answer: string }[];
  featureNotes?: { feature: string; benefit: string }[];
}) {
  return [
    input.name,
    input.company,
    input.website,
    input.domain,
    input.category,
    input.subcategory,
    input.shortDescription,
    input.summary,
    input.pricingModel,
    input.startingPriceUsd === null || input.startingPriceUsd === undefined
      ? undefined
      : `price ${input.startingPriceUsd} usd ${input.startingPriceUsd} dollars`,
    input.pricingNotes,
    input.freePlan,
    input.freeTrial === undefined ? undefined : `free trial ${input.freeTrial ? 'yes' : 'no'}`,
    input.features.join(' '),
    input.bestFor.join(' '),
    input.targetAudience.join(' '),
    input.tags.join(' '),
    input.aiType.join(' '),
    input.modalities.join(' '),
    input.modelProvider.join(' '),
    input.modelNames?.join(' '),
    input.apiAvailable === undefined ? undefined : `api available ${input.apiAvailable ? 'yes' : 'no'}`,
    input.openSource === undefined ? undefined : `open source ${input.openSource ? 'yes' : 'no'}`,
    input.deploymentType.join(' '),
    input.platforms.join(' '),
    input.integrations?.join(' '),
    input.teamCollaboration === undefined || input.teamCollaboration === null
      ? undefined
      : `team collaboration ${input.teamCollaboration ? 'yes' : 'no'}`,
    input.security?.join(' '),
    input.privacyNotes,
    input.status,
    input.launchYear === null || input.launchYear === undefined ? undefined : `launched ${input.launchYear}`,
    input.sourceUrl,
    input.sourceType,
    input.pros?.join(' '),
    input.cons?.join(' '),
    input.editorialVerdict,
    input.alternativesNote,
    input.faqs?.map((item) => `${item.question} ${item.answer}`).join(' '),
    input.featureNotes?.map((item) => `${item.feature} ${item.benefit}`).join(' '),
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

    let [total, tools, categories] = await Promise.all([
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

    if (input.search && tools.length === 0) {
      const fuzzyWhere = this.buildWhere({ ...input, search: undefined });
      const normalizedSearch = normalizeRecommendationQuery(input.search);
      const tokens = tokenize(normalizedSearch);
      const fuzzyCandidates = await prisma.aiTool.findMany({
        where: fuzzyWhere,
        orderBy: [{ popularityScore: 'desc' }, { rating: 'desc' }, { rank: 'asc' }],
        take: 1000,
      });
      const fuzzyResults = fuzzyCandidates
        .map((tool) => ({
          tool,
          score: fuzzyToolScore(tool, normalizedSearch, tokens),
        }))
        .filter((item) => item.score >= 14)
        .sort((left, right) => right.score - left.score);

      total = fuzzyResults.length;
      tools = fuzzyResults.slice((page - 1) * limit, page * limit).map((item) => item.tool);
    }

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

    const normalizedSearch = normalizeRecommendationQuery(normalizedQuery);
    const tokens = tokenize(normalizedSearch);

    if (tokens.length === 0) {
      return {
        query: normalizedQuery,
        data: [],
      };
    }

    let usedFuzzyFallback = false;
    let candidates = await this.getPrisma().aiTool.findMany({
      where: this.buildRecommendationWhere(tokens),
      take: 80,
      orderBy: [{ popularityScore: 'desc' }, { rating: 'desc' }, { rank: 'asc' }],
    });

    if (candidates.length === 0) {
      usedFuzzyFallback = true;
      candidates = await this.getPrisma().aiTool.findMany({
        take: 1000,
        orderBy: [{ popularityScore: 'desc' }, { rating: 'desc' }, { rank: 'asc' }],
      });
    }

    const scored = candidates
      .map((tool) => {
        const haystack = tool.searchText.toLowerCase();
        const exactBoost = haystack.includes(normalizedSearch) ? 20 : 0;
        const tokenScore = tokens.reduce((score, token) => score + (haystack.includes(token) ? 10 : 0), 0);
        const qualityScore = (tool.popularityScore ?? 0) / 10 + (tool.rating ?? 0);
        const fuzzyScore = fuzzyToolScore(tool, normalizedSearch, tokens);

        return {
          tool,
          score: Math.max(exactBoost + tokenScore + qualityScore, fuzzyScore),
        };
      })
      .filter((item) => !usedFuzzyFallback || item.score >= 14)
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

  /**
   * Hydrate a list of tool ids into normalized AITool DTOs, preserving the
   * input order and silently dropping ids that no longer resolve. Used by the
   * engagement layer (trending, rankings, saved, recently-viewed, related).
   */
  async hydrateByIds(ids: string[]) {
    const unique = Array.from(new Set(ids.filter(Boolean)));

    if (unique.length === 0) {
      return [];
    }

    const rows = await this.getPrisma().aiTool.findMany({
      where: { id: { in: unique } },
    });
    const byId = new Map(rows.map((row) => [row.id, normalizeTool(row)]));

    return ids
      .map((id) => byId.get(id))
      .filter((tool): tool is NonNullable<typeof tool> => Boolean(tool));
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

  /**
   * Popularity-ranked, deduplicated comparison pairs — same-category tools
   * first (what people actually search "X vs Y" for), each tool paired with
   * its nearest neighbors rather than every combination, so the list stays a
   * spread across categories instead of exhausting one category's full
   * combinatorial set. A canonical (sorted) key stops "A vs B" and "B vs A"
   * from both appearing as separate entries.
   */
  async getComparisons(limit = 120) {
    const take = clampNumber(limit, 2, 200);
    const tools = await this.getPrisma().aiTool.findMany({
      orderBy: this.buildOrderBy('popular'),
      take,
    });

    const byCategory = new Map<string, typeof tools>();
    for (const tool of tools) {
      const bucket = byCategory.get(tool.category);
      if (bucket) {
        bucket.push(tool);
      } else {
        byCategory.set(tool.category, [tool]);
      }
    }

    const seen = new Set<string>();
    const pairs: Array<{
      slug: string;
      title: string;
      summary: string;
      left: { slug: string; name: string; favicon: string; category: string };
      right: { slug: string; name: string; favicon: string; category: string };
    }> = [];

    const addPair = (left: (typeof tools)[number], right: (typeof tools)[number]) => {
      if (pairs.length >= take || left.slug === right.slug) return;
      const key = [left.slug, right.slug].sort().join('|');
      if (seen.has(key)) return;
      seen.add(key);
      pairs.push({
        slug: `${left.slug}-vs-${right.slug}`,
        title: `${left.name} vs ${right.name}`,
        summary: `Compare ${left.name} and ${right.name} across pricing, features, platforms, and use cases.`,
        left: { slug: left.slug, name: left.name, favicon: left.favicon, category: left.category },
        right: { slug: right.slug, name: right.name, favicon: right.favicon, category: right.category },
      });
    };

    for (const bucket of byCategory.values()) {
      for (let i = 0; i < bucket.length && pairs.length < take; i += 1) {
        for (let offset = 1; offset <= 2 && i + offset < bucket.length && pairs.length < take; offset += 1) {
          addPair(bucket[i], bucket[i + offset]);
        }
      }
    }

    // Fill any remaining slots with adjacent-popularity cross-category pairs.
    for (let index = 0; index < tools.length - 1 && pairs.length < take; index += 1) {
      addPair(tools[index], tools[index + 1]);
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
    const summary = cleanSummary(input.summary);
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
    const security = inputStringArray(input.security);
    const pros = inputStringArray(input.pros);
    const cons = inputStringArray(input.cons);
    const faqs = inputQaPairArray(input.faqs);
    const featureNotes = inputFeatureNoteArray(input.featureNotes);
    const editorialVerdict = cleanString(input.editorialVerdict) || null;
    const alternativesNote = cleanString(input.alternativesNote) || null;
    const startingPriceUsd = input.startingPriceUsd ?? null;
    const launchYear = input.launchYear ?? null;
    const sourceUrl = cleanString(input.sourceUrl) || website;
    const sourceType = cleanString(input.sourceType) || 'admin-api';
    const seo = buildToolSeo({
      name,
      slug,
      shortDescription,
      summary,
      category,
      company,
      tags,
      aiType,
      modelProvider,
      seoTitle: input.seoTitle,
      seoDescription: input.seoDescription,
      seoKeywords: input.seoKeywords,
      canonicalUrl: input.canonicalUrl,
      ogImage: input.ogImage,
      favicon: cleanString(input.logoUrl) || cleanString(input.favicon),
    });

    const searchText = buildToolSearchText({
      name,
      company,
      website,
      domain,
      category,
      subcategory,
      shortDescription,
      summary,
      pricingModel,
      startingPriceUsd,
      pricingNotes: input.pricingNotes ?? null,
      freePlan,
      freeTrial: input.freeTrial ?? false,
      features,
      bestFor,
      targetAudience,
      tags,
      aiType,
      modalities,
      modelProvider,
      modelNames,
      apiAvailable: input.apiAvailable ?? false,
      openSource: input.openSource ?? false,
      deploymentType,
      platforms,
      integrations,
      teamCollaboration: input.teamCollaboration ?? null,
      security,
      privacyNotes: input.privacyNotes ?? null,
      status: cleanString(input.status) || 'Active',
      launchYear,
      sourceUrl,
      sourceType,
      pros,
      cons,
      editorialVerdict,
      alternativesNote,
      faqs,
      featureNotes,
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
      startingPriceUsd,
      pricingNotes: input.pricingNotes ?? null,
      shortDescription,
      summary,
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
      security: jsonArrayOrNull(security),
      privacyNotes: input.privacyNotes ?? null,
      status: cleanString(input.status) || 'Active',
      launchYear,
      lastVerified: input.lastVerified ? new Date(`${input.lastVerified}T00:00:00.000Z`) : null,
      sourceUrl,
      sourceType,
      prosJson: jsonArrayOrNull(pros),
      consJson: jsonArrayOrNull(cons),
      editorialVerdict,
      alternativesNote,
      faqsJson: jsonObjectArrayOrNull(faqs),
      featureNotesJson: jsonObjectArrayOrNull(featureNotes),
      seoTitle: seo.title,
      seoDescription: seo.description,
      seoKeywords: seo.keywords,
      canonicalUrl: seo.canonical,
      ogImage: seo.ogImage,
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
      pros: input.pros ?? current.pros,
      cons: input.cons ?? current.cons,
      editorialVerdict: input.editorialVerdict ?? current.editorialVerdict,
      alternativesNote: input.alternativesNote ?? current.alternativesNote,
      faqs: input.faqs ?? current.faqs,
      featureNotes: input.featureNotes ?? current.featureNotes,
      deploymentType: input.deploymentType ?? current.deploymentType,
      platforms: input.platforms ?? current.platforms,
      seoTitle: input.seoTitle ?? current.seo?.title,
      seoDescription: input.seoDescription ?? current.seo?.description,
      seoKeywords: input.seoKeywords ?? current.seo?.keywords,
      canonicalUrl: input.canonicalUrl ?? current.seo?.canonical,
      ogImage: input.ogImage ?? current.seo?.ogImage,
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

  private buildRecommendationWhere(tokens: string[]): Prisma.AiToolWhereInput {
    const meaningfulTokens = tokens.slice(0, 12);

    return {
      OR: meaningfulTokens.flatMap((token) => [
        { name: { contains: token, mode: 'insensitive' } },
        { company: { contains: token, mode: 'insensitive' } },
        { category: { contains: token, mode: 'insensitive' } },
        { subcategory: { contains: token, mode: 'insensitive' } },
        { shortDescription: { contains: token, mode: 'insensitive' } },
        { summary: { contains: token, mode: 'insensitive' } },
        { searchText: { contains: token, mode: 'insensitive' } },
      ]),
    };
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
