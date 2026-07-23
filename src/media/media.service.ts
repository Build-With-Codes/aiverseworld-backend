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
    let response: Response;
    try {
      response = await fetch(url, { redirect: 'follow' });
    } catch {
      throw new BadRequestException(`Could not fetch image: ${url}`);
    }
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
