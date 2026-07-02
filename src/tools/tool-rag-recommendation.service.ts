import { Injectable, Logger } from '@nestjs/common';
import { Annotation, END, START, StateGraph } from '@langchain/langgraph';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { CloudflareAiService } from './cloudflare-ai.service';
import { LangfuseTracingService } from './langfuse-tracing.service';
import { ToolRagIndexService } from './tool-rag-index.service';
import type { ToolMetadataFilters } from './tool-rag-index.service';
import type { RagRecommendation } from './tool-rag.types';

type QueryUnderstanding = {
  intent: string;
  filters: ToolMetadataFilters;
  expandedQueries: string[];
};

const GraphState = Annotation.Root({
  requestId: Annotation<string>,
  query: Annotation<string>,
  rewrittenQuery: Annotation<string>,
  understanding: Annotation<QueryUnderstanding>({
    reducer: (_, update) => update,
    default: () => ({ intent: 'general', filters: {}, expandedQueries: [] }),
  }),
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
  popularityScore?: number;
  rating?: number;
  updatedAt?: Date;
  score: number;
  rerankScore?: number;
  businessScore?: number;
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
  private readonly promptVersion = 'ai-finder-rag-v2';
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
    private readonly cloudflareAi: CloudflareAiService,
    private readonly langfuse: LangfuseTracingService,
  ) {}

  async recommend(query: string, limit = 6) {
    const startedAt = Date.now();
    const normalizedQuery = query.trim();
    const requestId = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;

    this.logFlow(1, 'request_received', {
      requestId,
      query: normalizedQuery,
      limit,
      embeddingModel: this.ragIndex.getEmbeddingModelName(),
      vectorStore: this.ragIndex.getVectorStoreName(),
    });
    this.langfuse.createTrace({
      traceId: requestId,
      name: 'AI Finder recommendation',
      input: { query: normalizedQuery, limit },
      sessionId: requestId,
      tags: ['ai-finder', 'langgraph', 'rag'],
      metadata: {
        promptVersion: this.promptVersion,
        embeddingModel: this.ragIndex.getEmbeddingModelName(),
        vectorStore: this.ragIndex.getVectorStoreName(),
        langfuseConfigured: this.langfuse.isConfigured(),
      },
    });

    if (!normalizedQuery) {
      this.logFlow(1, 'empty_query_exit', {
        requestId,
        message: 'No query text received.',
      });

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

    if (process.env.AI_FINDER_ENSURE_INDEX_ON_QUERY === 'true') {
      const indexStartedAt = Date.now();
      this.logFlow(2, 'ensure_fresh_index_start', {
        requestId,
        mode: 'blocking-query-refresh',
      });
      const indexRefresh = await this.ragIndex.ensureFreshIndex();
      this.logFlow(2, 'ensure_fresh_index_done', {
        requestId,
        indexed: indexRefresh.indexed,
        latencyMs: Date.now() - indexStartedAt,
      });
    } else {
      this.logFlow(2, 'ensure_fresh_index_skipped', {
        requestId,
        reason:
          'Search requests do not block on indexing. Admin writes and reindex scripts update Pinecone.',
      });
    }

    const state = await this.graph.invoke({
      requestId,
      query: normalizedQuery,
      rewrittenQuery: normalizedQuery,
      understanding: { intent: 'general', filters: {}, expandedQueries: [] },
      retrieved: [],
      recommendations: [],
      llmAnswer: '',
    });
    const toolIds = state.recommendations
      .slice(0, limit)
      .map((recommendation) => recommendation.toolId);

    this.logFlow(10, 'final_selection', {
      requestId,
      recommendationCount: toolIds.length,
      selectedToolIds: toolIds,
      answer: state.llmAnswer,
    });

    if (toolIds.length === 0) {
      this.logFlow(11, 'response_no_matches', {
        requestId,
        retrievedChunks: state.retrieved.length,
      });
      this.langfuse.createScore({
        traceId: requestId,
        name: 'grounded',
        value: 0,
        comment: 'No recommendations returned.',
      });

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
    const responseTools = state.recommendations.slice(0, limit).flatMap((recommendation) => {
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
    });

    const grounding = this.evaluateGrounding(state.llmAnswer, state.recommendations);

    this.logFlow(11, 'grounding_evaluation', {
      requestId,
      ...grounding,
    });
    this.langfuse.createScore({
      traceId: requestId,
      name: 'faithfulness',
      value: grounding.faithfulnessScore,
      comment: grounding.grounded ? 'Grounded by retrieved context.' : 'Low context overlap.',
      metadata: grounding,
    });
    this.langfuse.createScore({
      traceId: requestId,
      name: 'grounded',
      value: grounding.grounded ? 1 : 0,
      metadata: grounding,
    });

    this.logFlow(11, 'response_ready', {
      requestId,
      totalLatencyMs: Date.now() - startedAt,
      returnedTools: responseTools.map((tool) => ({
        id: tool.id,
        name: tool.name,
        score: tool.recommendation.score,
      })),
    });
    this.langfuse.createEvent({
      traceId: requestId,
      name: '11 response_ready',
      output: {
        answer: state.llmAnswer || this.buildAnswer(normalizedQuery, state.recommendations, byId),
        tools: responseTools.map((tool) => ({
          id: tool.id,
          name: tool.name,
          score: tool.recommendation.score,
          reason: tool.recommendation.reason,
        })),
      },
      metadata: {
        totalLatencyMs: Date.now() - startedAt,
        returnedToolCount: responseTools.length,
      },
    });
    this.langfuse.createTrace({
      traceId: requestId,
      name: 'AI Finder recommendation',
      output: {
        answer: state.llmAnswer || this.buildAnswer(normalizedQuery, state.recommendations, byId),
        tools: responseTools.map((tool) => ({
          id: tool.id,
          name: tool.name,
          score: tool.recommendation.score,
          reason: tool.recommendation.reason,
        })),
      },
      metadata: {
        totalLatencyMs: Date.now() - startedAt,
        retrievedChunks: state.retrieved.length,
        recommendationCount: responseTools.length,
      },
    });

    return {
      query: normalizedQuery,
      answer: state.llmAnswer || this.buildAnswer(normalizedQuery, state.recommendations, byId),
      retrieval: {
        strategy: 'langgraph-rag-openrouter',
        embeddingModel: this.ragIndex.getEmbeddingModelName(),
        vectorStore: this.ragIndex.getVectorStoreName(),
        retrievedChunks: state.retrieved.length,
      },
      data: responseTools,
    };
  }

  private async routeQuery(state: GraphStateType): Promise<Partial<GraphStateType>> {
    const startedAt = Date.now();
    const tokens = tokenize(state.query);
    const normalized = normalizeQueryText(state.query);
    const filters = this.extractMetadataFilters(normalized, tokens);
    const intent = this.detectIntent(tokens);
    const hints = [
      tokens.includes('free') ? 'free plan' : '',
      tokens.includes('api') ? 'api access' : '',
      tokens.includes('open') && tokens.includes('source') ? 'open source' : '',
      tokens.includes('sales') ? 'marketing customer leads outreach crm business' : '',
      tokens.includes('video') || tokens.includes('generator')
        ? 'video generation text to video motion video creator'
        : '',
      filters.category ? filters.category : '',
      filters.subcategory ? filters.subcategory : '',
      filters.platform ? filters.platform : '',
    ].filter(Boolean);
    const expandedQueries = Array.from(
      new Set([
        normalized,
        `${intent} ai tool`,
        `${intent} software`,
        ...hints,
      ].filter(Boolean)),
    );
    const rewrittenQuery = expandedQueries.join(' ');

    this.logFlow(3, 'query_understanding', {
      requestId: state.requestId,
      originalQuery: state.query,
      rewrittenQuery,
      tokens,
      intent,
      filters,
      expandedQueries,
    });
    this.langfuse.createSpan({
      traceId: state.requestId,
      name: '03 query_understanding',
      startTime: startedAt,
      input: { query: state.query },
      output: {
        rewrittenQuery,
        intent,
        filters,
        expandedQueries,
        tokens,
      },
      metadata: { promptVersion: this.promptVersion },
    });

    return {
      rewrittenQuery,
      understanding: {
        intent,
        filters,
        expandedQueries,
      },
    };
  }

  private async retrieve(state: GraphStateType): Promise<Partial<GraphStateType>> {
    const startedAt = Date.now();
    this.logFlow(4, 'hybrid_retrieval_start', {
      requestId: state.requestId,
      rewrittenQuery: state.rewrittenQuery,
      filters: state.understanding.filters,
      limit: 18,
    });
    let retrieved = await this.ragIndex.searchHybrid(
      state.rewrittenQuery,
      state.understanding.filters,
      18,
      state.requestId,
    );
    const usedFilterFallback =
      retrieved.length === 0 && Object.keys(state.understanding.filters).length > 0;

    if (usedFilterFallback) {
      this.logFlow(4, 'hybrid_retrieval_filter_fallback', {
        requestId: state.requestId,
        reason: 'Filtered retrieval returned zero rows; retrying without metadata filters.',
      });
      retrieved = await this.ragIndex.searchHybrid(state.rewrittenQuery, {}, 18, state.requestId);
    }
    const mapped = retrieved.map(({ row, similarity }) => ({
      toolId: row.toolId,
      content: row.content,
      similarity,
    }));

    this.logFlow(5, 'hybrid_retrieval_done', {
      requestId: state.requestId,
      rewrittenQuery: state.rewrittenQuery,
      count: mapped.length,
      filters: state.understanding.filters,
      usedFilterFallback,
      topMatches: mapped.slice(0, 8).map((item) => ({
        toolId: item.toolId,
        score: Number(item.similarity.toFixed(4)),
        content: truncate(item.content, 220),
      })),
    });
    this.langfuse.createSpan({
      traceId: state.requestId,
      name: '04 hybrid_retrieval',
      startTime: startedAt,
      input: {
        rewrittenQuery: state.rewrittenQuery,
        filters: state.understanding.filters,
        limit: 18,
      },
      output: {
        count: mapped.length,
        usedFilterFallback,
        chunks: mapped.slice(0, 12).map((item) => ({
          toolId: item.toolId,
          score: Number(item.similarity.toFixed(4)),
          content: truncate(item.content, 700),
        })),
      },
      metadata: {
        vectorStore: this.ragIndex.getVectorStoreName(),
        embeddingModel: this.ragIndex.getEmbeddingModelName(),
      },
    });

    return { retrieved: mapped };
  }

  private async gradeAndGenerate(state: GraphStateType): Promise<Partial<GraphStateType>> {
    this.logFlow(6, 'candidate_builder_start', {
      requestId: state.requestId,
      retrievedChunks: state.retrieved.length,
    });
    const candidates = await this.buildCandidates(state);
    this.logFlow(7, 'rerank_business_start', {
      requestId: state.requestId,
      candidateCount: candidates.length,
    });
    const rankedCandidates = await this.rerankAndApplyBusinessRules(
      state.query,
      candidates,
      state.requestId,
    );
    this.logFlow(8, 'llm_recommendation_start', {
      requestId: state.requestId,
      candidateCount: rankedCandidates.slice(0, 10).length,
      openRouterConfigured: Boolean(process.env.OPENROUTER_API_KEY),
    });
    const llmDecision = await this.chooseWithOpenRouter(
      state.requestId,
      state.query,
      rankedCandidates.slice(0, 10),
    );

    if (llmDecision.recommendations.length > 0) {
      this.logFlow(9, 'llm_recommendation_done', {
        requestId: state.requestId,
        recommendationCount: llmDecision.recommendations.length,
        selectedToolIds: llmDecision.recommendations.map(
          (recommendation) => recommendation.toolId,
        ),
      });
      return llmDecision;
    }

    this.logFlow(9, 'fallback_ranking_used', {
      requestId: state.requestId,
      query: state.query,
      candidateCount: rankedCandidates.length,
    });

    return this.chooseWithFallback(state.requestId, state.query, rankedCandidates);
  }

  private async buildCandidates(state: GraphStateType): Promise<CandidateTool[]> {
    const startedAt = Date.now();
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
      .slice(0, 50);
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
          popularityScore: tool.popularityScore ?? undefined,
          rating: tool.rating ?? undefined,
          updatedAt: tool.updatedAt,
          score: item.score,
          context: item.contexts.join('\n---\n'),
        },
      ];
    });

    this.logFlow(6, 'candidate_builder_done', {
      requestId: state.requestId,
      candidateCount: candidates.length,
      candidates: candidates.map((candidate) => ({
        id: candidate.id,
        name: candidate.name,
        category: candidate.category,
        score: Number(candidate.score.toFixed(4)),
      })),
    });
    this.langfuse.createSpan({
      traceId: state.requestId,
      name: '06 candidate_builder',
      startTime: startedAt,
      input: {
        retrievedChunks: state.retrieved.length,
      },
      output: {
        candidateCount: candidates.length,
        candidates: candidates.map((candidate) => ({
          id: candidate.id,
          name: candidate.name,
          category: candidate.category,
          retrievalScore: Number(candidate.score.toFixed(4)),
          context: truncate(candidate.context, 700),
        })),
      },
    });

    return candidates;
  }

  private async rerankAndApplyBusinessRules(
    query: string,
    candidates: CandidateTool[],
    traceId?: string,
  ) {
    const startedAt = Date.now();
    if (candidates.length === 0) {
      return [];
    }

    const contexts = candidates.map((candidate) => this.describeCandidateForRerank(candidate));
    const reranked = await this.cloudflareAi.rerank(query, contexts, Math.min(10, candidates.length));
    const rerankByIndex = new Map(
      (reranked ?? []).map((item) => [item.index, Math.max(0, Math.min(1, item.score))]),
    );
    const maxRetrievalScore = Math.max(...candidates.map((candidate) => candidate.score), 1);
    const now = Date.now();
    const ranked = candidates
      .map((candidate, index) => {
        const retrievalScore = Math.max(0, Math.min(1, candidate.score / maxRetrievalScore));
        const rerankScore = rerankByIndex.get(index) ?? retrievalScore;
        const popularityScore = Math.max(0, Math.min(1, (candidate.popularityScore ?? 0) / 100));
        const ratingScore = Math.max(0, Math.min(1, (candidate.rating ?? 0) / 5));
        const updatedAtMs = candidate.updatedAt?.getTime() ?? 0;
        const ageDays = updatedAtMs > 0 ? (now - updatedAtMs) / 86_400_000 : 365;
        const freshnessScore = Math.max(0, Math.min(1, 1 - ageDays / 365));
        const intentFitScore = this.intentFitScore(query, candidate);
        const businessScore =
          retrievalScore * 0.35 +
          rerankScore * 0.3 +
          popularityScore * 0.15 +
          ratingScore * 0.1 +
          freshnessScore * 0.05 +
          intentFitScore * 0.05;

        return {
          ...candidate,
          rerankScore,
          businessScore,
          score: businessScore,
        };
      })
      .sort((left, right) => (right.businessScore ?? 0) - (left.businessScore ?? 0))
      .slice(0, 10);

    this.logFlow(7, 'rerank_business_done', {
      query,
      cloudflareRerank: Boolean(reranked),
      selected: ranked.map((candidate) => ({
        id: candidate.id,
        name: candidate.name,
        businessScore: Number((candidate.businessScore ?? 0).toFixed(4)),
        rerankScore: Number((candidate.rerankScore ?? 0).toFixed(4)),
      })),
    });
    this.langfuse.createSpan({
      traceId: traceId ?? '',
      name: '07 rerank_and_business_ranking',
      startTime: startedAt,
      input: {
        query,
        candidateCount: candidates.length,
      },
      output: {
        cloudflareRerank: Boolean(reranked),
        selected: ranked.map((candidate) => ({
          id: candidate.id,
          name: candidate.name,
          businessScore: Number((candidate.businessScore ?? 0).toFixed(4)),
          rerankScore: Number((candidate.rerankScore ?? 0).toFixed(4)),
        })),
      },
      metadata: {
        formula:
          '35% retrieval + 30% rerank + 15% popularity + 10% rating + 5% freshness + 5% intent fit',
      },
    });

    return ranked;
  }

  private describeCandidateForRerank(candidate: CandidateTool) {
    return [
      candidate.name,
      candidate.category,
      candidate.subcategory,
      candidate.summary ?? candidate.shortDescription,
      candidate.features.join(', '),
      candidate.bestFor.join(', '),
      candidate.targetAudience.join(', '),
      `Pricing: ${candidate.pricingModel}; free plan: ${candidate.freePlan}`,
    ]
      .filter(Boolean)
      .join('\n');
  }

  private intentFitScore(query: string, candidate: CandidateTool) {
    const tokens = tokenize(query);
    const haystack = this.describeCandidateForRerank(candidate).toLowerCase();

    if (tokens.length === 0) {
      return 0;
    }

    const matched = tokens.filter((token) => haystack.includes(token)).length;
    return Math.max(0, Math.min(1, matched / tokens.length));
  }

  private async chooseWithOpenRouter(
    traceId: string,
    query: string,
    candidates: CandidateTool[],
  ) {
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

    this.logFlow(8, 'llm_payload_ready', {
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

    const generationStartedAt = Date.now();

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

      this.logFlow(8, 'llm_response_status', {
        status: response.status,
        ok: response.ok,
        model: modelBody.model,
      });

      if (!response.ok) {
        const errorText = await response.text();
        this.logFlow(8, 'llm_http_error', {
          status: response.status,
          model: modelBody.model,
          body: truncate(errorText, 600),
        });
        this.langfuse.createGeneration({
          traceId,
          name: '08 openrouter_recommendation',
          startTime: generationStartedAt,
          model: modelBody.model,
          input: requestBody.messages,
          output: {
            status: response.status,
            body: truncate(errorText, 1000),
          },
          promptName: 'ai-finder-recommend-tools',
          promptVersion: this.promptVersion,
          metadata: {
            provider: 'openrouter',
            failed: true,
            candidateCount: candidatePayload.length,
          },
        });
        return { recommendations: [], llmAnswer: '' };
      }

      const payload = (await response.json()) as {
        choices?: Array<{ message?: { content?: string | object } }>;
        usage?: {
          prompt_tokens?: number;
          completion_tokens?: number;
          total_tokens?: number;
        };
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

      this.logFlow(9, 'llm_json_validated', {
        model: modelBody.model,
        rawContent: truncate(rawContent, 1000),
        selected: recommendations.map((recommendation) => ({
          toolId: recommendation.toolId,
          score: recommendation.score,
          reason: recommendation.reason,
        })),
      });
      this.langfuse.createGeneration({
        traceId,
        name: '08 openrouter_recommendation',
        startTime: generationStartedAt,
        model: modelBody.model,
        input: requestBody.messages,
        output: {
          rawContent,
          parsed,
          recommendations,
        },
        usage: payload.usage
          ? {
              promptTokens: payload.usage.prompt_tokens,
              completionTokens: payload.usage.completion_tokens,
              totalTokens: payload.usage.total_tokens,
            }
          : undefined,
        promptName: 'ai-finder-recommend-tools',
        promptVersion: this.promptVersion,
        metadata: {
          provider: 'openrouter',
          temperature: requestBody.temperature,
          candidateCount: candidatePayload.length,
        },
      });

      return {
        llmAnswer:
          typeof parsed?.answer === 'string'
            ? parsed.answer.trim()
            : this.buildFriendlyAnswer(query, recommendations, candidates),
        recommendations,
      };
    } catch (error) {
      this.logFlow(9, 'llm_failed_using_fallback', {
        model: modelBody.model,
        message: error instanceof Error ? error.message : 'unknown error',
      });
      this.langfuse.createGeneration({
        traceId,
        name: '08 openrouter_recommendation',
        startTime: generationStartedAt,
        model: modelBody.model,
        input: requestBody.messages,
        output: {
          error: error instanceof Error ? error.message : 'unknown error',
        },
        promptName: 'ai-finder-recommend-tools',
        promptVersion: this.promptVersion,
        metadata: {
          provider: 'openrouter',
          failed: true,
          candidateCount: candidatePayload.length,
        },
      });
      return { recommendations: [], llmAnswer: '' };
    }
  }

  private chooseWithFallback(traceId: string, query: string, candidates: CandidateTool[]) {
    const startedAt = Date.now();
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
        score: Math.round(Math.max(1, Math.min(100, score * 100))),
        reason: this.buildFallbackReason(candidate),
        matchedContext: candidate.context,
      }));

    this.logFlow(9, 'fallback_ranking_done', {
      query,
      selected: recommendations.map((recommendation) => ({
        toolId: recommendation.toolId,
        score: recommendation.score,
        reason: recommendation.reason,
      })),
    });
    this.langfuse.createSpan({
      traceId,
      name: '09 fallback_ranking',
      startTime: startedAt,
      input: { query, candidateCount: candidates.length },
      output: {
        selected: recommendations.map((recommendation) => ({
          toolId: recommendation.toolId,
          score: recommendation.score,
          reason: recommendation.reason,
        })),
      },
      metadata: { reason: 'LLM unavailable or returned no valid recommendations.' },
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

  private extractMetadataFilters(
    normalizedQuery: string,
    tokens: string[],
  ): ToolMetadataFilters {
    const filters: ToolMetadataFilters = {};

    if (
      tokens.includes('free') ||
      normalizedQuery.includes('no cost') ||
      normalizedQuery.includes('without paying') ||
      normalizedQuery.includes('no credit card')
    ) {
      filters.freeOnly = true;
    }

    if (
      tokens.includes('paid') ||
      tokens.includes('premium') ||
      tokens.includes('enterprise')
    ) {
      filters.pricing = tokens.includes('enterprise') ? 'Enterprise' : 'Paid';
    }

    if (
      tokens.includes('api') ||
      normalizedQuery.includes('developer api') ||
      normalizedQuery.includes('integrate')
    ) {
      filters.apiOnly = true;
    }

    if (
      normalizedQuery.includes('open source') ||
      normalizedQuery.includes('self host') ||
      normalizedQuery.includes('self-host')
    ) {
      filters.openSourceOnly = true;
    }

    if (tokens.includes('web') || tokens.includes('browser') || tokens.includes('online')) {
      filters.platform = 'web';
    } else if (tokens.includes('slack')) {
      filters.platform = 'slack';
    } else if (tokens.includes('chrome')) {
      filters.platform = 'chrome';
    } else if (tokens.includes('figma')) {
      filters.platform = 'figma';
    } else if (tokens.includes('vscode') || normalizedQuery.includes('vs code')) {
      filters.platform = 'vscode';
    }

    filters.category = this.detectCategory(tokens, normalizedQuery);
    filters.subcategory = this.detectSubcategory(
      tokens,
      normalizedQuery,
      filters.category,
    );

    return filters;
  }

  private detectIntent(tokens: string[]) {
    if (
      tokens.some((token) =>
        [
          'security',
          'cybersecurity',
          'hacking',
          'hack',
          'pentest',
          'penetration',
          'vulnerability',
          'threat',
          'malware',
          'wifi',
        ].includes(token),
      )
    ) {
      return 'cybersecurity and security testing';
    }

    if (tokens.some((token) => ['video', 'youtube', 'shorts', 'reels'].includes(token))) {
      return 'video generation';
    }

    if (tokens.some((token) => ['voice', 'audio', 'speech', 'podcast', 'transcription'].includes(token))) {
      return 'voice and audio';
    }

    if (tokens.some((token) => ['image', 'logo', 'thumbnail', 'design', 'photo'].includes(token))) {
      return 'image and design generation';
    }

    if (tokens.some((token) => ['code', 'coding', 'developer', 'programming', 'app'].includes(token))) {
      return 'coding assistance';
    }

    if (tokens.some((token) => ['write', 'writing', 'copy', 'blog', 'email'].includes(token))) {
      return 'writing assistance';
    }

    if (tokens.some((token) => ['seo', 'marketing', 'sales', 'ads'].includes(token))) {
      return 'marketing';
    }

    if (tokens.some((token) => ['research', 'paper', 'study', 'academic'].includes(token))) {
      return 'research';
    }

    if (tokens.some((token) => ['meeting', 'notes', 'transcript'].includes(token))) {
      return 'meeting productivity';
    }

    if (tokens.some((token) => ['legal', 'law', 'contract', 'compliance'].includes(token))) {
      return 'legal and compliance';
    }

    if (tokens.some((token) => ['medical', 'health', 'healthcare', 'doctor', 'wellness'].includes(token))) {
      return 'healthcare';
    }

    if (tokens.some((token) => ['finance', 'financial', 'payment', 'fraud', 'invoice'].includes(token))) {
      return 'finance';
    }

    if (tokens.some((token) => ['data', 'analytics', 'spreadsheet', 'dashboard'].includes(token))) {
      return 'data analysis';
    }

    return 'general AI productivity';
  }

  private detectCategory(tokens: string[], normalizedQuery: string) {
    if (
      tokens.some((token) =>
        [
          'security',
          'cybersecurity',
          'hacking',
          'hack',
          'pentest',
          'penetration',
          'vulnerability',
          'threat',
          'malware',
          'wifi',
        ].includes(token),
      )
    ) {
      return 'Security';
    }

    if (tokens.some((token) => ['video', 'youtube', 'shorts', 'reels'].includes(token))) {
      return 'Video Generation';
    }

    if (tokens.some((token) => ['voice', 'audio', 'speech', 'podcast'].includes(token))) {
      return 'Voice/Audio';
    }

    if (tokens.some((token) => ['transcription', 'transcript'].includes(token))) {
      return 'Audio';
    }

    if (tokens.some((token) => ['image', 'photo', 'thumbnail', 'logo'].includes(token))) {
      return 'Image Generation';
    }

    if (tokens.some((token) => ['design', 'poster', 'creative'].includes(token))) {
      return 'Design Assistant';
    }

    if (tokens.some((token) => ['code', 'coding', 'programming'].includes(token))) {
      return 'Coding Assistant';
    }

    if (tokens.some((token) => ['developer', 'workflow', 'engine'].includes(token))) {
      return 'Developer Tools';
    }

    if (tokens.some((token) => ['write', 'writing', 'copy', 'blog', 'email'].includes(token))) {
      return 'Writing Assistant';
    }

    if (tokens.some((token) => ['seo', 'marketing', 'sales', 'ads'].includes(token))) {
      return 'Marketing';
    }

    if (tokens.some((token) => ['research', 'paper', 'academic'].includes(token))) {
      return 'Research';
    }

    if (tokens.some((token) => ['meeting', 'notes', 'transcript'].includes(token))) {
      return 'Meeting Assistant';
    }

    if (tokens.some((token) => ['finance', 'financial', 'payment', 'fraud', 'invoice'].includes(token))) {
      return 'Finance';
    }

    if (tokens.some((token) => ['medical', 'health', 'healthcare', 'doctor', 'wellness'].includes(token))) {
      return 'Healthcare';
    }

    if (tokens.some((token) => ['legal', 'law', 'contract', 'compliance'].includes(token))) {
      return 'Legal';
    }

    if (tokens.some((token) => ['data', 'analytics', 'spreadsheet', 'dashboard'].includes(token))) {
      return 'Data Analysis';
    }

    if (normalizedQuery.includes('presentation') || tokens.includes('slides')) {
      return 'Presentation';
    }

    if (tokens.includes('automation') || tokens.includes('workflow')) {
      return 'Automation';
    }

    return undefined;
  }

  private detectSubcategory(
    tokens: string[],
    normalizedQuery: string,
    category?: string,
  ) {
    const hasAny = (values: string[]) => tokens.some((token) => values.includes(token));

    if (
      category === 'Security' &&
      hasAny([
        'security',
        'cybersecurity',
        'hacking',
        'hack',
        'pentest',
        'penetration',
        'vulnerability',
        'threat',
        'malware',
        'wifi',
      ])
    ) {
      return 'App Security';
    }

    if (hasAny(['wifi', 'network', 'router', 'telecom'])) {
      return 'Network AI';
    }

    if (hasAny(['shorts', 'reels', 'tiktok'])) {
      return 'Short Video';
    }

    if (normalizedQuery.includes('text to video') || normalizedQuery.includes('text-to-video')) {
      return 'Text-to-Video';
    }

    if (hasAny(['video', 'youtube'])) {
      return 'Video Generator';
    }

    if (hasAny(['podcast'])) {
      return 'Podcast Editor';
    }

    if (hasAny(['transcription', 'transcript'])) {
      return 'Speech-to-Text';
    }

    if (hasAny(['voice', 'speech'])) {
      return 'Voice Generation';
    }

    if (hasAny(['logo'])) {
      return 'Logo Designer';
    }

    if (hasAny(['photo', 'image', 'thumbnail'])) {
      return hasAny(['edit', 'editor', 'enhance', 'enhancer'])
        ? 'Photo Editor'
        : 'Text to Image';
    }

    if (hasAny(['prototype', 'prototyping', 'wireframe'])) {
      return 'UI Prototyping';
    }

    if (hasAny(['design', 'poster', 'creative'])) {
      return hasAny(['ui', 'ux']) ? 'UI/UX Design' : 'Design Tool';
    }

    if (hasAny(['code', 'coding', 'programming'])) {
      return 'AI Code Editor';
    }

    if (hasAny(['workflow', 'automation', 'engine'])) {
      return 'Workflow Engine';
    }

    if (hasAny(['email'])) {
      return 'Email Writer';
    }

    if (hasAny(['copy', 'copywriting'])) {
      return 'Copy Generator';
    }

    if (hasAny(['blog', 'write', 'writing'])) {
      return 'AI Writing';
    }

    if (hasAny(['seo'])) {
      return 'SEO Assistant';
    }

    if (hasAny(['meeting', 'notes'])) {
      return 'Meeting Summary';
    }

    if (hasAny(['payment'])) {
      return 'Payment Processing';
    }

    if (hasAny(['health', 'healthcare', 'medical', 'doctor', 'wellness'])) {
      return 'Health Assistant';
    }

    if (hasAny(['spreadsheet'])) {
      return 'Spreadsheet Assistant';
    }

    if (hasAny(['analytics', 'dashboard', 'metrics'])) {
      return 'Analytics Tool';
    }

    return undefined;
  }

  private buildFallbackReason(candidate: CandidateTool) {
    const bestFor = candidate.bestFor[0] || candidate.subcategory || candidate.category;

    return `Good fit for ${bestFor.toLowerCase()} based on its core features.`;
  }

  private evaluateGrounding(answer: string, recommendations: RagRecommendation[]) {
    const claimTokens = tokenize(
      [
        answer,
        ...recommendations.map((recommendation) => recommendation.reason),
      ].join(' '),
    ).filter((token) => token.length > 3);
    const context = recommendations
      .map((recommendation) => recommendation.matchedContext)
      .join(' ')
      .toLowerCase();

    if (claimTokens.length === 0 || !context.trim()) {
      return {
        grounded: false,
        faithfulnessScore: 0,
        checkedTokens: claimTokens.length,
        matchedTokens: 0,
        reason: 'No answer tokens or matched retrieval context available.',
      };
    }

    const uniqueTokens = Array.from(new Set(claimTokens));
    const matchedTokens = uniqueTokens.filter((token) => context.includes(token));
    const faithfulnessScore = matchedTokens.length / uniqueTokens.length;

    return {
      grounded: faithfulnessScore >= 0.35,
      faithfulnessScore: Number(faithfulnessScore.toFixed(3)),
      checkedTokens: uniqueTokens.length,
      matchedTokens: matchedTokens.length,
      unsupportedTokens: uniqueTokens
        .filter((token) => !context.includes(token))
        .slice(0, 12),
    };
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

  private logFlow(step: number, event: string, payload: Record<string, unknown>) {
    this.logger.log(
      `ai_finder_flow step=${String(step).padStart(2, '0')} event=${event} ${JSON.stringify(
        payload,
      )}`,
    );
  }
}
