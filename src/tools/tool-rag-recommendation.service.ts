import { Injectable, Logger } from '@nestjs/common';
import { Annotation, END, START, StateGraph } from '@langchain/langgraph';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { ToolRagIndexService } from './tool-rag-index.service';
import type { RagRecommendation } from './tool-rag.types';

const GraphState = Annotation.Root({
  query: Annotation<string>,
  rewrittenQuery: Annotation<string>,
  retrieved: Annotation<Array<{ toolId: string; content: string; similarity: number }>>({
    reducer: (_, update) => update,
    default: () => [],
  }),
  recommendations: Annotation<RagRecommendation[]>({
    reducer: (_, update) => update,
    default: () => [],
  }),
  llmAnswer: Annotation<string>({
    reducer: (_, update) => update,
    default: () => '',
  }),
});

type GraphStateType = typeof GraphState.State;

type CandidateTool = {
  id: string;
  name: string;
  category: string;
  subcategory: string;
  shortDescription: string;
  summary?: string;
  features: string[];
  bestFor: string[];
  targetAudience: string[];
  pricingModel: string;
  freePlan: string;
  score: number;
  context: string;
};

type LlmDecision = {
  answer?: string;
  recommendations?: Array<{
    toolId?: string;
    reason?: string;
    score?: number;
  }>;
};

function asStringArray(value: Prisma.JsonValue | null | undefined): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
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

function tokenize(value: string) {
  return normalizeQueryText(value)
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 2 && !STOP_WORDS.has(token));
}

function resolveOpenRouterChatUrl() {
  const configuredUrl = process.env.OPENROUTER_BASE_URL?.trim();
  const base = (configuredUrl ?? 'https://openrouter.ai/api/v1').replace(/\/+$/, '');

  if (base.endsWith('/chat/completions')) {
    return base;
  }

  if (base.endsWith('/api/v1')) {
    return `${base}/chat/completions`;
  }

  if (base.endsWith('/api')) {
    return `${base}/v1/chat/completions`;
  }

  return `${base}/api/v1/chat/completions`;
}

function buildOpenRouterModelBody() {
  return {
    model: process.env.OPENROUTER_MODEL?.trim() || 'openrouter/free',
  };
}

function cleanJsonContent(value: string) {
  return value
    .trim()
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/i, '')
    .trim();
}

function truncate(value: string, length = 260) {
  return value.length > length ? `${value.slice(0, length)}...` : value;
}

@Injectable()
export class ToolRagRecommendationService {
  private readonly logger = new Logger(ToolRagRecommendationService.name);
  private readonly graph = new StateGraph(GraphState)
    .addNode('routeQuery', (state) => this.routeQuery(state))
    .addNode('retrieve', (state) => this.retrieve(state))
    .addNode('gradeAndGenerate', (state) => this.gradeAndGenerate(state))
    .addEdge(START, 'routeQuery')
    .addEdge('routeQuery', 'retrieve')
    .addEdge('retrieve', 'gradeAndGenerate')
    .addEdge('gradeAndGenerate', END)
    .compile();

  constructor(
    private readonly prismaService: PrismaService,
    private readonly ragIndex: ToolRagIndexService,
  ) {}

  async recommend(query: string, limit = 6) {
    const normalizedQuery = query.trim();
    const requestId = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;

    this.logInfo('ai_finder_request', {
      requestId,
      query: normalizedQuery,
      limit,
    });

    if (!normalizedQuery) {
      return {
        query: normalizedQuery,
        answer: 'Describe the job you need done and the AI Finder will recommend tools.',
        retrieval: {
          strategy: 'empty-query',
          embeddingModel: this.ragIndex.getEmbeddingModelName(),
          vectorStore: this.ragIndex.getVectorStoreName(),
        },
        data: [],
      };
    }

    await this.ragIndex.ensureFreshIndex();

    const state = await this.graph.invoke({
      query: normalizedQuery,
      rewrittenQuery: normalizedQuery,
      retrieved: [],
      recommendations: [],
      llmAnswer: '',
    });
    const toolIds = state.recommendations
      .slice(0, limit)
      .map((recommendation) => recommendation.toolId);

    this.logInfo('ai_finder_final', {
      requestId,
      recommendationCount: toolIds.length,
      selectedToolIds: toolIds,
      answer: state.llmAnswer,
    });

    if (toolIds.length === 0) {
      return {
        query: normalizedQuery,
        answer:
          'I could not find a strong catalog match yet. Try describing the use case with a few more details.',
        retrieval: {
          strategy: 'langgraph-rag-openrouter',
          embeddingModel: this.ragIndex.getEmbeddingModelName(),
          vectorStore: this.ragIndex.getVectorStoreName(),
          retrievedChunks: state.retrieved.length,
        },
        data: [],
      };
    }

    const tools = await this.prismaService.getClient()?.aiTool.findMany({
      where: { id: { in: toolIds } },
    });
    const byId = new Map((tools ?? []).map((tool) => [tool.id, tool]));

    return {
      query: normalizedQuery,
      answer: state.llmAnswer || this.buildAnswer(normalizedQuery, state.recommendations, byId),
      retrieval: {
        strategy: 'langgraph-rag-openrouter',
        embeddingModel: this.ragIndex.getEmbeddingModelName(),
        vectorStore: this.ragIndex.getVectorStoreName(),
        retrievedChunks: state.retrieved.length,
      },
      data: state.recommendations.slice(0, limit).flatMap((recommendation) => {
        const tool = byId.get(recommendation.toolId);

        if (!tool) {
          return [];
        }

        return [
          {
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
            recommendation: {
              score: recommendation.score,
              reason: recommendation.reason,
              matchedContext: recommendation.matchedContext,
            },
          },
        ];
      }),
    };
  }

  private async routeQuery(state: GraphStateType): Promise<Partial<GraphStateType>> {
    const tokens = tokenize(state.query);
    const hints = [
      tokens.includes('free') ? 'free plan' : '',
      tokens.includes('api') ? 'api access' : '',
      tokens.includes('open') && tokens.includes('source') ? 'open source' : '',
      tokens.includes('sales') ? 'marketing customer leads outreach crm business' : '',
      tokens.includes('video') || tokens.includes('generator')
        ? 'video generation text to video motion video creator'
        : '',
    ].filter(Boolean);
    const rewrittenQuery = [normalizeQueryText(state.query), ...hints].join(' ');

    this.logInfo('ai_finder_route', {
      originalQuery: state.query,
      rewrittenQuery,
      tokens,
    });

    return { rewrittenQuery };
  }

  private async retrieve(state: GraphStateType): Promise<Partial<GraphStateType>> {
    const retrieved = await this.ragIndex.searchSimilar(state.rewrittenQuery, 18);
    const mapped = retrieved.map(({ row, similarity }) => ({
      toolId: row.toolId,
      content: row.content,
      similarity,
    }));

    this.logInfo('ai_finder_retrieved', {
      rewrittenQuery: state.rewrittenQuery,
      count: mapped.length,
      topMatches: mapped.slice(0, 8).map((item) => ({
        toolId: item.toolId,
        score: Number(item.similarity.toFixed(4)),
        content: truncate(item.content, 220),
      })),
    });

    return { retrieved: mapped };
  }

  private async gradeAndGenerate(state: GraphStateType): Promise<Partial<GraphStateType>> {
    const candidates = await this.buildCandidates(state);
    const llmDecision = await this.chooseWithOpenRouter(state.query, candidates);

    if (llmDecision.recommendations.length > 0) {
      return llmDecision;
    }

    this.logInfo('ai_finder_fallback_used', {
      query: state.query,
      candidateCount: candidates.length,
    });

    return this.chooseWithFallback(state.query, candidates);
  }

  private async buildCandidates(state: GraphStateType): Promise<CandidateTool[]> {
    const grouped = new Map<string, { score: number; contexts: string[] }>();
    const queryTokens = tokenize(state.rewrittenQuery);

    for (const item of state.retrieved) {
      const current = grouped.get(item.toolId) ?? { score: 0, contexts: [] };
      const contentLower = item.content.toLowerCase();
      const tokenBoost = queryTokens.reduce(
        (score, token) => score + (contentLower.includes(token) ? 0.12 : 0),
        0,
      );
      current.score += item.similarity + tokenBoost;
      current.contexts.push(item.content.slice(0, 700));
      grouped.set(item.toolId, current);
    }

    const ranked = Array.from(grouped.entries())
      .map(([toolId, item]) => ({ toolId, ...item }))
      .sort((left, right) => right.score - left.score)
      .slice(0, 12);
    const tools = await this.prismaService.getClient()?.aiTool.findMany({
      where: { id: { in: ranked.map((item) => item.toolId) } },
    });
    const byId = new Map((tools ?? []).map((tool) => [tool.id, tool]));
    const candidates = ranked.flatMap((item) => {
      const tool = byId.get(item.toolId);

      if (!tool) {
        return [];
      }

      return [
        {
          id: tool.id,
          name: tool.name,
          category: tool.category,
          subcategory: tool.subcategory,
          shortDescription: tool.shortDescription,
          summary: tool.summary ?? undefined,
          features: asStringArray(tool.features),
          bestFor: asStringArray(tool.bestFor),
          targetAudience: asStringArray(tool.targetAudience),
          pricingModel: tool.pricingModel,
          freePlan: tool.freePlan,
          score: item.score,
          context: item.contexts.join('\n---\n'),
        },
      ];
    });

    this.logInfo('ai_finder_candidates', {
      candidateCount: candidates.length,
      candidates: candidates.map((candidate) => ({
        id: candidate.id,
        name: candidate.name,
        category: candidate.category,
        score: Number(candidate.score.toFixed(4)),
      })),
    });

    return candidates;
  }

  private async chooseWithOpenRouter(query: string, candidates: CandidateTool[]) {
    if (!process.env.OPENROUTER_API_KEY || candidates.length === 0) {
      return { recommendations: [], llmAnswer: '' };
    }

    const candidatePayload = candidates.map((candidate) => ({
      toolId: candidate.id,
      name: candidate.name,
      category: candidate.category,
      subcategory: candidate.subcategory,
      description: candidate.summary ?? candidate.shortDescription,
      features: candidate.features,
      bestFor: candidate.bestFor,
      audience: candidate.targetAudience,
      pricing: candidate.pricingModel,
      freePlan: candidate.freePlan,
      retrievedContext: truncate(candidate.context, 900),
    }));
    const openRouterUrl = resolveOpenRouterChatUrl();
    const modelBody = buildOpenRouterModelBody();
    const requestBody = {
      ...modelBody,
      temperature: 0.1,
      messages: [
        {
          role: 'system',
          content:
            'Return ONLY valid JSON. You recommend AI tools from provided candidates.\n\nSchema:\n{"answer":"short user-facing sentence","recommendations":[{"toolId":"candidate toolId","reason":"plain user-facing reason, max 22 words","score":number 1-100}]}\n\nRules:\n- Choose 1 to 4 tools only.\n- Use only candidate toolId values.\n- Correct obvious typos in the user query.\n- Ignore accidental token/name matches that do not satisfy the user intent.\n- Reasons must not mention vectors, retrieval, RAG, metadata, chunks, LangChain, LangGraph, Pinecone, or matched tokens.\n- Prefer tools whose category/features directly solve the user request.',
        },
        {
          role: 'user',
          content: JSON.stringify({
            query,
            candidates: candidatePayload,
          }),
        },
      ],
    };

    this.logInfo('ai_finder_llm_payload', {
      url: openRouterUrl,
      model: modelBody.model,
      candidateCount: candidatePayload.length,
      candidates: candidatePayload.map((candidate) => ({
        toolId: candidate.toolId,
        name: candidate.name,
        category: candidate.category,
        description: truncate(candidate.description, 180),
        context: truncate(candidate.retrievedContext, 240),
      })),
    });

    try {
      const response = await this.withTimeout(
        fetch(openRouterUrl, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': process.env.OPENROUTER_SITE_URL ?? 'https://aiverseworld.com',
            'X-Title': process.env.OPENROUTER_APP_NAME ?? 'AiverseWorld AI Finder',
          },
          body: JSON.stringify(requestBody),
        }),
        12000,
      );

      this.logInfo('ai_finder_llm_response_status', {
        status: response.status,
        ok: response.ok,
        model: modelBody.model,
      });

      if (!response.ok) {
        const errorText = await response.text();
        this.logger.warn(
          `ai_finder_llm_error ${JSON.stringify({
            status: response.status,
            model: modelBody.model,
            body: truncate(errorText, 600),
          })}`,
        );
        return { recommendations: [], llmAnswer: '' };
      }

      const payload = (await response.json()) as {
        choices?: Array<{ message?: { content?: string | object } }>;
      };
      const content = payload.choices?.[0]?.message?.content;
      const rawContent =
        typeof content === 'string' ? content : JSON.stringify(content ?? {});
      const parsed =
        typeof content === 'string'
          ? (JSON.parse(cleanJsonContent(content)) as LlmDecision)
          : (content as LlmDecision | undefined);
      const candidateIds = new Set(candidates.map((candidate) => candidate.id));
      const recommendations = (parsed?.recommendations ?? [])
        .filter(
          (item): item is { toolId: string; reason?: string; score?: number } =>
            typeof item.toolId === 'string' && candidateIds.has(item.toolId),
        )
        .slice(0, 4)
        .map((item) => ({
          toolId: item.toolId,
          score: Math.max(1, Math.min(100, Math.round(item.score ?? 80))),
          reason: item.reason?.trim() || 'A strong fit for the task you described.',
          matchedContext:
            candidates.find((candidate) => candidate.id === item.toolId)?.context ?? '',
        }));

      this.logInfo('ai_finder_llm_response', {
        model: modelBody.model,
        rawContent: truncate(rawContent, 1000),
        selected: recommendations.map((recommendation) => ({
          toolId: recommendation.toolId,
          score: recommendation.score,
          reason: recommendation.reason,
        })),
      });

      return {
        llmAnswer:
          typeof parsed?.answer === 'string'
            ? parsed.answer.trim()
            : this.buildFriendlyAnswer(query, recommendations, candidates),
        recommendations,
      };
    } catch (error) {
      this.logger.warn(
        `ai_finder_llm_exception ${JSON.stringify({
          model: modelBody.model,
          message: error instanceof Error ? error.message : 'unknown error',
        })}`,
      );
      return { recommendations: [], llmAnswer: '' };
    }
  }

  private chooseWithFallback(query: string, candidates: CandidateTool[]) {
    const queryTokens = tokenize(query);
    const intentFiltered = this.filterCandidatesByIntent(queryTokens, candidates);
    const recommendations = intentFiltered
      .map((candidate) => {
        const haystack = [
          candidate.name,
          candidate.category,
          candidate.subcategory,
          candidate.shortDescription,
          candidate.summary,
          candidate.features.join(' '),
          candidate.bestFor.join(' '),
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        const intentBoost = queryTokens.reduce(
          (score, token) => score + (haystack.includes(token) ? 0.35 : 0),
          0,
        );

        return {
          candidate,
          score: candidate.score + intentBoost,
        };
      })
      .sort((left, right) => right.score - left.score)
      .slice(0, 4)
      .map(({ candidate, score }) => ({
        toolId: candidate.id,
        score: Math.round(Math.max(1, Math.min(100, score * 40))),
        reason: this.buildFallbackReason(candidate),
        matchedContext: candidate.context,
      }));

    this.logInfo('ai_finder_fallback_selected', {
      query,
      selected: recommendations.map((recommendation) => ({
        toolId: recommendation.toolId,
        score: recommendation.score,
        reason: recommendation.reason,
      })),
    });

    return {
      recommendations,
      llmAnswer: this.buildFriendlyAnswer(query, recommendations, candidates),
    };
  }

  private filterCandidatesByIntent(queryTokens: string[], candidates: CandidateTool[]) {
    const wantsVideo =
      queryTokens.includes('video') ||
      queryTokens.includes('generator') ||
      queryTokens.includes('generate');

    if (!wantsVideo) {
      return candidates;
    }

    const videoCandidates = candidates.filter((candidate) => {
      const haystack = [
        candidate.category,
        candidate.subcategory,
        candidate.shortDescription,
        candidate.summary,
        candidate.features.join(' '),
        candidate.bestFor.join(' '),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return haystack.includes('video');
    });

    return videoCandidates.length > 0 ? videoCandidates : candidates;
  }

  private buildFallbackReason(candidate: CandidateTool) {
    const bestFor = candidate.bestFor[0] || candidate.subcategory || candidate.category;

    return `Good fit for ${bestFor.toLowerCase()} based on its core features.`;
  }

  private buildFriendlyAnswer(
    query: string,
    recommendations: RagRecommendation[],
    candidates: CandidateTool[],
  ) {
    const byId = new Map(candidates.map((candidate) => [candidate.id, candidate.name]));
    const names = recommendations
      .slice(0, 4)
      .map((recommendation) => byId.get(recommendation.toolId))
      .filter(Boolean);

    if (names.length === 0) {
      return `I could not find a confident recommendation for "${query}" yet. Try adding a little more detail.`;
    }

    return `For "${query}", I recommend ${names.join(', ')}.`;
  }

  private buildAnswer(
    query: string,
    recommendations: RagRecommendation[],
    tools: Map<string, { name: string; category: string }>,
  ) {
    const names = recommendations
      .slice(0, 4)
      .map((recommendation) => tools.get(recommendation.toolId)?.name)
      .filter(Boolean);

    if (names.length === 0) {
      return `I could not find a confident recommendation for "${query}" yet. Try adding a little more detail.`;
    }

    return `For "${query}", I recommend ${names.join(', ')}.`;
  }

  private async withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error('OpenRouter request timeout')), ms),
      ),
    ]);
  }

  private logInfo(event: string, payload: Record<string, unknown>) {
    this.logger.log(`${event} ${JSON.stringify(payload)}`);
  }
}
