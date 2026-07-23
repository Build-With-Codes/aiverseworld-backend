import { Injectable, Logger } from '@nestjs/common';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * Object storage for media assets. Targets Cloudflare R2 (S3-compatible) when
 * configured via env; otherwise falls back to local disk so the pipeline works
 * in development without credentials.
 *
 * Env for R2:
 *   CLOUDFLARE_ACCOUNT_ID   (endpoint host)
 *   R2_ACCESS_KEY_ID
 *   R2_SECRET_ACCESS_KEY
 *   R2_BUCKET
 *   R2_PUBLIC_URL           (public bucket base, e.g. https://media.aiverseworld.com)
 * Local fallback:
 *   MEDIA_PUBLIC_BASE_URL   (defaults to http://localhost:<PORT|3001>) → serves /uploads
 */
type R2Config = {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  publicUrl: string;
};

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private client: S3Client | null = null;

  private get r2Config(): R2Config | null {
    const accountId = process.env.CLOUDFLARE_ACCOUNT_ID?.trim();
    const accessKeyId = process.env.R2_ACCESS_KEY_ID?.trim();
    const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY?.trim();
    const bucket = process.env.R2_BUCKET?.trim();
    const publicUrl = process.env.R2_PUBLIC_URL?.trim();
    if (accountId && accessKeyId && secretAccessKey && bucket && publicUrl) {
      return { accountId, accessKeyId, secretAccessKey, bucket, publicUrl };
    }
    return null;
  }

  isR2Configured() {
    return this.r2Config !== null;
  }

  private getClient(config: R2Config) {
    if (!this.client) {
      this.client = new S3Client({
        region: 'auto',
        endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
        credentials: {
          accessKeyId: config.accessKeyId,
          secretAccessKey: config.secretAccessKey,
        },
      });
    }
    return this.client;
  }

  /** Store bytes under `key`; returns the public URL. */
  async put(key: string, body: Buffer, contentType: string): Promise<string> {
    const config = this.r2Config;

    if (config) {
      const client = this.getClient(config);
      await client.send(
        new PutObjectCommand({
          Bucket: config.bucket,
          Key: key,
          Body: body,
          ContentType: contentType,
          CacheControl: 'public, max-age=31536000, immutable',
        }),
      );
      return `${config.publicUrl.replace(/\/$/, '')}/${key}`;
    }

    // Local fallback → data/uploads/<key>, served at /uploads by the app.
    const uploadsRoot = join(process.cwd(), 'data', 'uploads');
    const target = join(uploadsRoot, key);
    await mkdir(join(target, '..'), { recursive: true });
    await writeFile(target, body);
    const base =
      process.env.MEDIA_PUBLIC_BASE_URL?.trim() ||
      `http://localhost:${process.env.PORT ?? 3001}`;
    this.logger.debug(`Stored media locally (no R2 configured): ${key}`);
    return `${base.replace(/\/$/, '')}/uploads/${key}`;
  }
}
