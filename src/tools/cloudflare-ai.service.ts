import { Injectable, Logger } from '@nestjs/common';

type CloudflareEnvelope = {
  success?: boolean;
  errors?: Array<{ message?: string }>;
  result?: unknown;
};

type RerankResult = {
  index: number;
  score: number;
};

function isNumberArray(value: unknown): value is number[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'number');
}

function extractEmbeddingRows(value: unknown): number[][] {
  if (Array.isArray(value)) {
    if (value.every(isNumberArray)) {
      return value;
    }

    if (isNumberArray(value)) {
      return [value];
    }
  }

  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;

    for (const key of ['data', 'embeddings', 'vectors']) {
      const rows = extractEmbeddingRows(record[key]);

      if (rows.length > 0) {
        return rows;
      }
    }
  }

  return [];
}

function extractRerankRows(value: unknown): RerankResult[] {
  if (Array.isArray(value)) {
    return value.flatMap((item, fallbackIndex) => {
      if (!item || typeof item !== 'object') {
        return [];
      }

      const record = item as Record<string, unknown>;
      const rawIndex = record.index ?? record.id ?? fallbackIndex;
      const rawScore = record.score ?? record.relevance_score ?? record.relevanceScore;
      const index = typeof rawIndex === 'number' ? rawIndex : Number(rawIndex);
      const score = typeof rawScore === 'number' ? rawScore : Number(rawScore);

      if (!Number.isFinite(index) || !Number.isFinite(score)) {
        return [];
      }

      return [{ index, score }];
    });
  }

  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;

    for (const key of ['response', 'results', 'data']) {
      const rows = extractRerankRows(record[key]);

      if (rows.length > 0) {
        return rows;
      }
    }
  }

  return [];
}

@Injectable()
export class CloudflareAiService {
  private readonly logger = new Logger(CloudflareAiService.name);
  private readonly embeddingsModel =
    process.env.CLOUDFLARE_EMBEDDING_MODEL?.trim() || '@cf/baai/bge-m3';
  private readonly rerankerModel =
    process.env.CLOUDFLARE_RERANKER_MODEL?.trim() || '@cf/baai/bge-reranker-base';

  isConfigured() {
    return Boolean(this.getAccountId() && this.getApiToken());
  }

  getCredentialStatus() {
    return {
      configured: this.isConfigured(),
      hasAccountId: Boolean(this.getAccountId()),
      hasApiToken: Boolean(this.getApiToken()),
      acceptedAccountIdEnv: [
        'CLOUDFLARE_ACCOUNT_ID',
        'CLOUDFLARE_ACCOUNTID',
        'CF_ACCOUNT_ID',
        'CF_ACCOUNTID',
      ],
      acceptedTokenEnv: [
        'CLOUDFLARE_API_TOKEN',
        'CLOUDFLARE_AUTH_TOKEN',
        'CLOUDFLARE_AI_API_TOKEN',
        'CLOUDFLARE_API_KEY',
        'CF_API_TOKEN',
        'CF_API_KEY',
      ],
    };
  }

  getEmbeddingModelName() {
    return this.isConfigured() ? `cloudflare:${this.embeddingsModel}` : null;
  }

  async embedTexts(texts: string[]) {
    if (!this.isConfigured() || texts.length === 0) {
      this.logCloudflareFlow('embeddings_skipped', {
        ...this.getCredentialStatus(),
        inputCount: texts.length,
      });
      return null;
    }

    try {
      this.logCloudflareFlow('embeddings_request_start', {
        model: this.embeddingsModel,
        inputCount: texts.length,
      });
      const result = await this.runModel(this.embeddingsModel, { text: texts });
      const rows = extractEmbeddingRows(result);

      if (rows.length !== texts.length) {
        this.logger.warn(
          `Cloudflare embedding response row mismatch: expected ${texts.length}, got ${rows.length}.`,
        );
        return null;
      }

      this.logCloudflareFlow('embeddings_request_done', {
        model: this.embeddingsModel,
        inputCount: texts.length,
        dimensions: rows[0]?.length ?? 0,
      });

      return rows;
    } catch (error) {
      this.logCloudflareFlow('embeddings_request_failed', {
        model: this.embeddingsModel,
        inputCount: texts.length,
        message: error instanceof Error ? error.message : 'unknown error',
      });
      this.logger.warn(
        `Cloudflare embeddings failed: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );
      return null;
    }
  }

  async rerank(query: string, contexts: string[], topK = contexts.length) {
    if (!this.isConfigured() || !query.trim() || contexts.length === 0) {
      this.logCloudflareFlow('rerank_skipped', {
        ...this.getCredentialStatus(),
        hasQuery: Boolean(query.trim()),
        contextCount: contexts.length,
      });
      return null;
    }

    try {
      this.logCloudflareFlow('rerank_request_start', {
        model: this.rerankerModel,
        contextCount: contexts.length,
        topK,
      });
      const result = await this.runModel(this.rerankerModel, {
        query,
        top_k: Math.max(1, topK),
        contexts: contexts.map((text) => ({ text })),
      });
      const rows = extractRerankRows(result);

      this.logCloudflareFlow('rerank_request_done', {
        model: this.rerankerModel,
        contextCount: contexts.length,
        returned: rows.length,
      });

      return rows.length > 0 ? rows : null;
    } catch (error) {
      this.logCloudflareFlow('rerank_request_failed', {
        model: this.rerankerModel,
        contextCount: contexts.length,
        message: error instanceof Error ? error.message : 'unknown error',
      });
      this.logger.warn(
        `Cloudflare rerank failed: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );
      return null;
    }
  }

  private async runModel(model: string, body: Record<string, unknown>) {
    const accountId = this.getAccountId();
    const apiToken = this.getApiToken();

    if (!accountId || !apiToken) {
      throw new Error('Cloudflare Workers AI credentials are not configured.');
    }

    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${model}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      },
    );
    const payload = (await response.json()) as CloudflareEnvelope;

    if (!response.ok || payload.success === false) {
      const message =
        payload.errors?.map((error) => error.message).filter(Boolean).join('; ') ||
        `Cloudflare Workers AI request failed with status ${response.status}`;
      throw new Error(message);
    }

    return payload.result ?? payload;
  }

  private getAccountId() {
    return (
      process.env.CLOUDFLARE_ACCOUNT_ID?.trim() ||
      process.env.CLOUDFLARE_ACCOUNTID?.trim() ||
      process.env.CF_ACCOUNT_ID?.trim() ||
      process.env.CF_ACCOUNTID?.trim()
    );
  }

  private getApiToken() {
    return (
      process.env.CLOUDFLARE_API_TOKEN?.trim() ||
      process.env.CLOUDFLARE_AUTH_TOKEN?.trim() ||
      process.env.CLOUDFLARE_AI_API_TOKEN?.trim() ||
      process.env.CLOUDFLARE_API_KEY?.trim() ||
      process.env.CF_API_TOKEN?.trim() ||
      process.env.CF_API_KEY?.trim()
    );
  }

  private logCloudflareFlow(event: string, payload: Record<string, unknown>) {
    this.logger.log(`ai_finder_cloudflare event=${event} ${JSON.stringify(payload)}`);
  }
}
