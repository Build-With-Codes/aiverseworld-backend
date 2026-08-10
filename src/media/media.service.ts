import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import sharp from 'sharp';
import { createHash, randomUUID } from 'node:crypto';
import { PrismaService } from '../database/prisma.service';
import { StorageService } from './storage.service';

export type MediaMeta = {
  altText?: string;
  caption?: string;
  credit?: string;
  license?: string;
  filename?: string;
};

/**
 * Basic SSRF guard for the admin-only image-ingest endpoint. Not a
 * DNS-rebinding-proof check (that needs to resolve the hostname and
 * re-validate the actual connecting IP, which `fetch` doesn't expose) — this
 * blocks the obvious cases: non-http(s) schemes and literal
 * localhost/private/link-local/metadata-endpoint hosts an admin could paste
 * or a compromised admin session could be tricked into fetching.
 */
function assertSafeIngestUrl(rawUrl: string) {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new BadRequestException('Invalid URL.');
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new BadRequestException('Only http/https URLs are allowed.');
  }

  const hostname = parsed.hostname.toLowerCase();
  const blockedExact = new Set(['localhost', '0.0.0.0', '::1', 'metadata.google.internal']);
  const blockedPatterns = [
    /^127\./, // loopback
    /^10\./, // private
    /^192\.168\./, // private
    /^172\.(1[6-9]|2\d|3[01])\./, // private
    /^169\.254\./, // link-local / cloud metadata (AWS/Azure/GCP)
    /^0\./, // "this network"
    /^\[?fe80:/i, // IPv6 link-local
    /^\[?f[cd][0-9a-f]{2}:/i, // IPv6 unique local
  ];

  if (blockedExact.has(hostname) || blockedPatterns.some((pattern) => pattern.test(hostname))) {
    throw new BadRequestException('That URL points to a private or internal address and cannot be fetched.');
  }
}

const MAX_WIDTH = 1600; // downscale oversized originals
const MAX_BYTES = 15 * 1024 * 1024;

@Injectable()
export class MediaService {
  private readonly logger = new Logger(MediaService.name);

  constructor(
    private readonly prismaService: PrismaService,
    private readonly storage: StorageService,
  ) {}

  private getPrisma() {
    const prisma = this.prismaService.getClient();
    if (!prisma) {
      throw new ServiceUnavailableException('Media persistence is not configured.');
    }
    return prisma;
  }

  /** Process a raw image buffer → optimized webp + metadata, store, record. */
  async processAndStore(input: Buffer, meta: MediaMeta = {}, sourceUrl?: string) {
    if (input.length > MAX_BYTES) {
      throw new BadRequestException('Image exceeds the 15MB limit.');
    }

    let pipeline = sharp(input, { failOn: 'none' }).rotate();
    const meta0 = await pipeline.metadata();
    if (meta0.width && meta0.width > MAX_WIDTH) {
      pipeline = pipeline.resize({ width: MAX_WIDTH, withoutEnlargement: true });
    }

    // Main asset as webp.
    const webp = await pipeline.webp({ quality: 82 }).toBuffer();
    const finalMeta = await sharp(webp).metadata();

    // Tiny blurred base64 placeholder for next/image.
    const blur = await sharp(input)
      .resize(16, 16, { fit: 'inside' })
      .webp({ quality: 40 })
      .toBuffer();
    const blurDataUrl = `data:image/webp;base64,${blur.toString('base64')}`;

    const hash = createHash('sha1').update(webp).digest('hex').slice(0, 12);
    const baseName = (meta.filename || 'image')
      .replace(/\.[a-z0-9]+$/i, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48) || 'image';
    const key = `blog/${baseName}-${hash}.webp`;

    const url = await this.storage.put(key, webp, 'image/webp');

    const prisma = this.getPrisma();
    const record = await prisma.media.create({
      data: {
        filename: `${baseName}.webp`,
        url,
        storageKey: this.storage.isR2Configured() ? key : null,
        mimeType: 'image/webp',
        format: 'webp',
        width: finalMeta.width ?? null,
        height: finalMeta.height ?? null,
        size: webp.length,
        altText: meta.altText ?? null,
        caption: meta.caption ?? null,
        credit: meta.credit ?? null,
        license: meta.license ?? null,
        blurDataUrl,
        sourceUrl: sourceUrl ?? null,
      },
    });

    return record;
  }

  /** Ingest from an external image URL (download → process → store). */
  async ingestFromUrl(url: string, meta: MediaMeta = {}) {
    const response = await this.fetchWithValidatedRedirects(url);
    if (!response.ok) {
      throw new BadRequestException(`Image URL returned ${response.status}.`);
    }
    const contentType = response.headers.get('content-type') ?? '';
    if (!contentType.startsWith('image/')) {
      throw new BadRequestException(`URL is not an image (got ${contentType || 'unknown'}).`);
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    const filename = meta.filename || url.split('/').pop() || `image-${randomUUID().slice(0, 8)}`;
    return this.processAndStore(buffer, { ...meta, filename }, url);
  }

  /**
   * SSRF-safe fetch: validates the URL before every hop instead of `fetch`'s
   * `redirect: 'follow'`, which would happily follow a redirect straight
   * past our check (e.g. an attacker-controlled URL that 302s to
   * 169.254.169.254). Bounded to 5 hops to avoid a redirect loop.
   */
  private async fetchWithValidatedRedirects(url: string, hopsRemaining = 5): Promise<Response> {
    assertSafeIngestUrl(url);

    let response: Response;
    try {
      response = await fetch(url, { redirect: 'manual' });
    } catch {
      throw new BadRequestException(`Could not fetch image: ${url}`);
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location) {
        throw new BadRequestException(`Image URL redirected without a Location header.`);
      }
      if (hopsRemaining <= 0) {
        throw new BadRequestException('Too many redirects while fetching image URL.');
      }
      const nextUrl = new URL(location, url).toString();
      return this.fetchWithValidatedRedirects(nextUrl, hopsRemaining - 1);
    }

    return response;
  }

  async ingestFromBase64(dataOrBase64: string, meta: MediaMeta = {}) {
    const base64 = dataOrBase64.includes(',') ? dataOrBase64.split(',')[1] : dataOrBase64;
    const buffer = Buffer.from(base64, 'base64');
    if (buffer.length === 0) throw new BadRequestException('Empty image payload.');
    return this.processAndStore(buffer, meta);
  }

  async getById(id: string) {
    const prisma = this.getPrisma();
    return prisma.media.findUnique({ where: { id } });
  }
}
