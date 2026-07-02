import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'node:crypto';

const DEFAULT_TTL_SECONDS = 2 * 24 * 60 * 60;
const VERSION_CACHE_MS = 30_000;
const VERSION_KEY = 'aiverseworld:public-api-cache:version';

type UpstashResponse<T> = {
  result?: T;
  error?: string;
};

export type CacheabilityResult = {
  cacheable: boolean;
  reason?: string;
};

@Injectable()
export class PublicApiCacheService {
  private readonly logger = new Logger(PublicApiCacheService.name);
  private readonly redisUrl = process.env.REDIS_URL?.trim() || '';
  private readonly restUrl = this.resolveRestUrl();
  private readonly restToken = this.resolveRestToken();
  private readonly ttlSeconds = this.resolveTtl();
  private versionCache: { value: string; expiresAt: number } | undefined;
  private warnedUnavailable = false;

  isEnabled() {
    return Boolean(this.restUrl && this.restToken && this.ttlSeconds > 0);
  }

  isCacheableRequest(method: string | undefined, path: string) {
    return this.getCacheability(method, path).cacheable;
  }

  getCacheability(method: string | undefined, path: string): CacheabilityResult {
    if (method !== 'GET') {
      return { cacheable: false, reason: 'non-GET request' };
    }

    if (!this.isEnabled()) {
      return { cacheable: false, reason: 'Redis cache disabled or missing env' };
    }

    if (path === '/health' || path === '/') {
      return { cacheable: false, reason: 'root/health endpoint' };
    }

    if (path.startsWith('/api/english-tutor')) {
      return { cacheable: false, reason: 'interactive English tutor endpoint' };
    }

    if (path === '/api/tools/rag/reindex' || path === '/api/news/health') {
      return { cacheable: false, reason: 'operational endpoint' };
    }

    if (path === '/api/tools/recommend' || path === '/api/tools/recommend/rag') {
      return { cacheable: false, reason: 'AI recommendation endpoint is query-specific' };
    }

    if (path.startsWith('/api/tools') || path.startsWith('/api/problems') || path.startsWith('/api/news')) {
      return { cacheable: true };
    }

    return { cacheable: false, reason: 'route outside public catalog APIs' };
  }

  async buildKey(method: string, originalUrl: string) {
    const version = await this.getVersion();
    const hash = createHash('sha256').update(`${method}:${originalUrl}`).digest('hex');

    return `aiverseworld:public-api-cache:${version}:${hash}`;
  }

  async get<T>(key: string): Promise<T | null> {
    const value = await this.command<string | null>(['GET', key]);

    if (!value) {
      return null;
    }

    try {
      const payload = JSON.parse(value) as { data?: T };
      return payload.data ?? null;
    } catch {
      return null;
    }
  }

  async set(key: string, data: unknown) {
    await this.command(['SET', key, JSON.stringify({ data }), 'EX', this.ttlSeconds]);
  }

  async invalidate(reason: string) {
    if (!this.isEnabled()) {
      return;
    }

    const version = await this.command<number>(['INCR', VERSION_KEY]);

    if (version) {
      this.versionCache = {
        value: String(version),
        expiresAt: Date.now() + VERSION_CACHE_MS,
      };
      this.logger.log(`Invalidated public API cache (${reason}); version=${version}`);
    }
  }

  private async getVersion() {
    if (this.versionCache && this.versionCache.expiresAt > Date.now()) {
      return this.versionCache.value;
    }

    const version = (await this.command<string | null>(['GET', VERSION_KEY])) || '1';
    this.versionCache = {
      value: version,
      expiresAt: Date.now() + VERSION_CACHE_MS,
    };

    return version;
  }

  private async command<T = unknown>(command: Array<string | number>): Promise<T | null> {
    if (!this.isEnabled()) {
      this.warnUnavailableOnce();
      return null;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2_500);

    try {
      const response = await fetch(this.restUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.restToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(command),
        signal: controller.signal,
      });

      if (!response.ok) {
        this.logger.warn(`Redis cache command failed with HTTP ${response.status}`);
        return null;
      }

      const payload = (await response.json()) as UpstashResponse<T>;

      if (payload.error) {
        this.logger.warn(`Redis cache command failed: ${payload.error}`);
        return null;
      }

      return payload.result ?? null;
    } catch (error) {
      this.logger.warn(`Redis cache unavailable: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }

  private resolveRestUrl() {
    const configured =
      process.env.UPSTASH_REDIS_REST_URL?.trim() ||
      process.env.REDIS_REST_URL?.trim() ||
      '';

    if (configured.startsWith('http://') || configured.startsWith('https://')) {
      return configured.replace(/\/$/, '');
    }

    if (!this.redisUrl.startsWith('redis://') && !this.redisUrl.startsWith('rediss://')) {
      return '';
    }

    try {
      const parsed = new URL(this.redisUrl);
      return `https://${parsed.hostname}`;
    } catch {
      return '';
    }
  }

  private resolveRestToken() {
    const configured =
      process.env.UPSTASH_REDIS_REST_TOKEN?.trim() ||
      process.env.REDIS_TOKEN?.trim() ||
      '';

    if (configured) {
      return configured;
    }

    if (!this.redisUrl.startsWith('redis://') && !this.redisUrl.startsWith('rediss://')) {
      return '';
    }

    try {
      return decodeURIComponent(new URL(this.redisUrl).password || '');
    } catch {
      return '';
    }
  }

  private resolveTtl() {
    const configured = Number(process.env.API_CACHE_TTL_SECONDS);

    return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_TTL_SECONDS;
  }

  private warnUnavailableOnce() {
    if (this.warnedUnavailable) {
      return;
    }

    this.warnedUnavailable = true;
    this.logger.warn(
      'Public API Redis cache is disabled. Configure UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN.',
    );
  }
}
