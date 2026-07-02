import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

type IngestionEventType =
  | 'trace-create'
  | 'span-create'
  | 'generation-create'
  | 'score-create'
  | 'event-create';

type Usage = {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
};

function iso(value: number | Date) {
  return typeof value === 'number' ? new Date(value).toISOString() : value.toISOString();
}

function safeJsonSize(value: unknown) {
  try {
    return JSON.stringify(value).length;
  } catch {
    return 0;
  }
}

@Injectable()
export class LangfuseTracingService {
  private readonly logger = new Logger(LangfuseTracingService.name);

  isConfigured() {
    return Boolean(this.getPublicKey() && this.getSecretKey());
  }

  createTrace(input: {
    traceId: string;
    name: string;
    input?: unknown;
    output?: unknown;
    metadata?: Record<string, unknown>;
    sessionId?: string;
    userId?: string;
    tags?: string[];
  }) {
    return this.ingest('trace-create', {
      id: input.traceId,
      name: input.name,
      input: input.input,
      output: input.output,
      metadata: input.metadata,
      sessionId: input.sessionId,
      userId: input.userId,
      tags: input.tags,
      timestamp: new Date().toISOString(),
    });
  }

  createSpan(input: {
    traceId: string;
    name: string;
    startTime: number;
    endTime?: number;
    input?: unknown;
    output?: unknown;
    metadata?: Record<string, unknown>;
  }) {
    if (!input.traceId) {
      return;
    }

    return this.ingest('span-create', {
      id: randomUUID(),
      traceId: input.traceId,
      name: input.name,
      startTime: iso(input.startTime),
      endTime: iso(input.endTime ?? Date.now()),
      input: input.input,
      output: input.output,
      metadata: {
        ...input.metadata,
        latencyMs: (input.endTime ?? Date.now()) - input.startTime,
      },
    });
  }

  createGeneration(input: {
    traceId: string;
    name: string;
    startTime: number;
    endTime?: number;
    model: string;
    input?: unknown;
    output?: unknown;
    usage?: Usage;
    metadata?: Record<string, unknown>;
    promptName?: string;
    promptVersion?: string;
  }) {
    if (!input.traceId) {
      return;
    }

    return this.ingest('generation-create', {
      id: randomUUID(),
      traceId: input.traceId,
      name: input.name,
      model: input.model,
      promptName: input.promptName,
      promptVersion: input.promptVersion,
      startTime: iso(input.startTime),
      endTime: iso(input.endTime ?? Date.now()),
      input: input.input,
      output: input.output,
      usage: input.usage,
      metadata: {
        ...input.metadata,
        latencyMs: (input.endTime ?? Date.now()) - input.startTime,
      },
    });
  }

  createScore(input: {
    traceId: string;
    name: string;
    value: number;
    comment?: string;
    metadata?: Record<string, unknown>;
  }) {
    if (!input.traceId) {
      return;
    }

    return this.ingest('score-create', {
      id: randomUUID(),
      traceId: input.traceId,
      name: input.name,
      value: input.value,
      comment: input.comment,
      metadata: input.metadata,
    });
  }

  createEvent(input: {
    traceId: string;
    name: string;
    input?: unknown;
    output?: unknown;
    metadata?: Record<string, unknown>;
  }) {
    if (!input.traceId) {
      return;
    }

    return this.ingest('event-create', {
      id: randomUUID(),
      traceId: input.traceId,
      name: input.name,
      input: input.input,
      output: input.output,
      metadata: input.metadata,
    });
  }

  private ingest(type: IngestionEventType, body: Record<string, unknown>) {
    if (!this.isConfigured()) {
      return;
    }

    const payload = {
      batch: [
        {
          id: randomUUID(),
          type,
          timestamp: new Date().toISOString(),
          body,
        },
      ],
      metadata: {
        sdk: 'aiverseworld-backend-custom',
        payloadBytes: safeJsonSize(body),
      },
    };

    void fetch(`${this.getBaseUrl()}/api/public/ingestion`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(
          `${this.getPublicKey()}:${this.getSecretKey()}`,
        ).toString('base64')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    }).catch((error) => {
      this.logger.warn(
        `Langfuse ingestion failed: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );
    });
  }

  private getBaseUrl() {
    return (
      process.env.LANGFUSE_BASE_URL?.trim() ||
      process.env.LANGFUSE_HOST?.trim() ||
      'https://cloud.langfuse.com'
    ).replace(/\/+$/, '');
  }

  private getPublicKey() {
    return process.env.LANGFUSE_PUBLIC_KEY?.trim();
  }

  private getSecretKey() {
    return process.env.LANGFUSE_SECRET_KEY?.trim();
  }
}
