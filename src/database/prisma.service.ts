import {
  Injectable,
  Logger,
  OnApplicationShutdown,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { Prisma, PrismaClient } from '@prisma/client';
import { Pool } from 'pg';

@Injectable()
export class PrismaService implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(PrismaService.name);
  private readonly schemaName = 'aiverse_world';
  private readonly defaultPoolMax = 10;
  private readonly defaultPoolIdleTimeoutMs = 10_000;
  private readonly defaultPoolConnectionTimeoutMs = 5_000;
  private readonly requiredTables = [
    'NewsSource',
    'RawArticle',
    'AiArticle',
    'NewsPipelineRun',
    'Problem',
    'AiToolSource',
    'AiTool',
    'AiToolEmbedding',
    'ToolYoutubeVideo',
    'BookRecommendation',
    'PageBook',
    'SeoPage',
  ];
  private available = false;
  private pool: Pool | null = null;
  private client: PrismaClient | null = null;
  private readonly migrationsPath = join(process.cwd(), 'prisma', 'migrations');
  private lastError: string | null = null;
  private reconnecting: Promise<boolean> | null = null;
  private databaseInfo: {
    db: string;
    schema: string;
    host: string | null;
    port: number | null;
  } | null = null;
  private missingTables: string[] = [];
  private runtimeConnectionHost: string | null = null;

  constructor() {
    const databaseUrl = this.resolveDatabaseUrl();

    if (databaseUrl) {
      this.runtimeConnectionHost = this.extractConnectionHost(databaseUrl);
      this.pool = new Pool({
        connectionString: databaseUrl,
        max: Number(process.env.DB_POOL_MAX ?? this.defaultPoolMax),
        idleTimeoutMillis: Number(
          process.env.DB_POOL_IDLE_TIMEOUT_MS ?? this.defaultPoolIdleTimeoutMs,
        ),
        connectionTimeoutMillis: Number(
          process.env.DB_POOL_CONNECTION_TIMEOUT_MS ??
            this.defaultPoolConnectionTimeoutMs,
        ),
      });
      this.pool.on('error', (err) => {
        this.logger.error('Unexpected pg pool error', err);
      });
      this.client = new PrismaClient({
        adapter: new PrismaPg(this.pool),
      });
    }
  }

  async onModuleInit() {
    this.logMigrationStatus();

    if (!this.client) {
      this.logger.warn(
        'DATABASE_URL is not set. Prisma persistence is disabled.',
      );
      return;
    }

    try {
      await this.client.$connect();
      this.available = true;
      this.lastError = null;
      await this.ensureAppSchema();
      await this.loadDatabaseDiagnostics();
      if (this.available) {
        this.logger.log('Prisma connected. Persistence is enabled.');
      } else {
        this.logger.warn(
          `Prisma connected, but persistence is not ready: ${this.lastError ?? 'database diagnostics failed'}`,
        );
      }
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Unknown Prisma connection error';
      this.lastError = message;
      this.logger.error(`Prisma connection failed: ${message}`);
    }
  }

  isAvailable() {
    return this.available;
  }

  markUnavailable(reason: string) {
    if (this.available) {
      this.logger.error(`Prisma persistence disabled at runtime: ${reason}`);
    }

    this.available = false;
    this.lastError = reason;
  }

  async ensureAvailable() {
    if (this.available) {
      return true;
    }

    if (!this.client) {
      return false;
    }

    if (this.reconnecting) {
      return this.reconnecting;
    }

    this.reconnecting = this.tryReconnect();
    const result = await this.reconnecting;
    this.reconnecting = null;
    return result;
  }

  getClient() {
    return this.client;
  }

  getStatus() {
    return {
      configured: Boolean(process.env.DATABASE_URL?.trim()),
      connected: this.available,
      lastError: this.lastError,
      database: this.databaseInfo,
      missingTables: this.missingTables,
      runtimeConnection: {
        type: 'pooled',
        env: 'DATABASE_URL',
        host: this.runtimeConnectionHost,
        poolMax: Number(process.env.DB_POOL_MAX ?? this.defaultPoolMax),
      },
      migrationConnection: {
        type: 'direct',
        env: process.env.DIRECT_URL?.trim()
          ? 'DIRECT_URL'
          : process.env.DIRECT_DATABASE_URL?.trim()
            ? 'DIRECT_DATABASE_URL'
            : null,
        configured: Boolean(
          process.env.DIRECT_URL?.trim() ||
          process.env.DIRECT_DATABASE_URL?.trim(),
        ),
      },
    };
  }

  async onApplicationShutdown() {
    await this.client?.$disconnect();
    await this.pool?.end();
  }

  private logMigrationStatus() {
    if (!existsSync(this.migrationsPath)) {
      this.logger.warn(
        'No Prisma migrations directory found. Run `npm.cmd run prisma:migrate` or `npm.cmd run prisma:push` before relying on persistence.',
      );
      return;
    }

    const migrationDirs = readdirSync(this.migrationsPath, {
      withFileTypes: true,
    }).filter((entry) => entry.isDirectory());

    if (migrationDirs.length === 0) {
      this.logger.warn(
        'No Prisma migration files found. Run `npm.cmd run prisma:migrate` or `npm.cmd run prisma:push` to create database tables.',
      );
      return;
    }

    this.logger.log(
      `Detected ${migrationDirs.length} Prisma migration set(s) in prisma/migrations.`,
    );
  }

  private async tryReconnect() {
    if (!this.client) {
      return false;
    }

    try {
      await this.client.$queryRaw`SELECT 1`;
      this.available = true;
      this.lastError = null;
      await this.ensureAppSchema();
      await this.loadDatabaseDiagnostics();
      this.logger.log('Prisma reconnected. Persistence is enabled again.');
      return true;
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Unknown Prisma reconnection error';
      this.available = false;
      this.lastError = message;
      this.logger.warn(`Prisma reconnect failed: ${message}`);
      return false;
    }
  }

  private async loadDatabaseDiagnostics() {
    if (!this.client) {
      return;
    }

    const [dbInfoRows, tableRows] = await Promise.all([
      this.client.$queryRawUnsafe<
        Array<{
          db: string;
          schema: string;
          host: string | null;
          port: number | null;
        }>
      >(
        `select current_database() as db, current_schema() as schema, inet_server_addr()::text as host, inet_server_port() as port`,
      ),
      this.client.$queryRaw<Array<{ tablename: string }>>(
        Prisma.sql`SELECT tablename FROM pg_tables WHERE schemaname = ${this.schemaName}`,
      ),
    ]);

    this.databaseInfo = dbInfoRows[0] ?? null;
    const existingTables = new Set(tableRows.map((row) => row.tablename));
    this.missingTables = this.requiredTables.filter(
      (tableName) => !existingTables.has(tableName),
    );

    if (this.databaseInfo) {
      this.logger.log(
        `Connected database target: ${this.databaseInfo.db} on ${this.databaseInfo.host ?? 'unknown-host'}:${this.databaseInfo.port ?? 'unknown-port'} schema ${this.schemaName}.`,
      );
    }

    if (this.missingTables.length > 0) {
      this.logger.warn(
        `Tables missing in schema "${this.schemaName}": ${this.missingTables.join(', ')}. Run \`npm.cmd run prisma:migrate\` for migrations or \`npm.cmd run prisma:push\` for dev schema sync.`,
      );
      const autoCreated = this.tryAutoPush();

      if (!autoCreated) {
        this.available = false;
        this.lastError = `Missing tables: ${this.missingTables.join(', ')}`;
        return;
      }

      // Re-verify tables exist after push
      const verifyRows = await this.client.$queryRaw<
        Array<{ tablename: string }>
      >(
        Prisma.sql`SELECT tablename FROM pg_tables WHERE schemaname = ${this.schemaName}`,
      );
      const verifiedTables = new Set(verifyRows.map((r) => r.tablename));
      const stillMissing = this.requiredTables.filter(
        (t) => !verifiedTables.has(t),
      );

      if (stillMissing.length > 0) {
        this.available = false;
        this.lastError = `Auto-push ran but tables still missing: ${stillMissing.join(', ')}`;
        this.logger.error(this.lastError);
        return;
      }

      this.logger.log('All required tables verified after auto-push.');
    }

    this.missingTables = [];
  }

  private tryAutoPush() {
    const isProduction = process.env.NODE_ENV === 'production';
    const autoPushEnabled = process.env.PRISMA_AUTO_PUSH !== 'false';

    if (isProduction || !autoPushEnabled) {
      return false;
    }

    this.logger.warn(
      'Development mode detected. Running `prisma db push` automatically because required tables are missing.',
    );

    const result =
      process.platform === 'win32'
        ? spawnSync(
            process.env.ComSpec ?? 'cmd.exe',
            ['/d', '/s', '/c', 'npx prisma db push --accept-data-loss'],
            {
              cwd: process.cwd(),
              env: process.env,
              encoding: 'utf8',
            },
          )
        : spawnSync('npx', ['prisma', 'db', 'push', '--accept-data-loss'], {
            cwd: process.cwd(),
            env: process.env,
            encoding: 'utf8',
          });

    if (result.status !== 0) {
      const message =
        result.error?.message ||
        result.stderr?.trim() ||
        result.stdout?.trim() ||
        `prisma db push exited with code ${result.status ?? 'unknown'}`;
      this.logger.error(`Automatic prisma db push failed: ${message}`);
      return false;
    }

    this.logger.log('Automatic prisma db push completed successfully.');
    this.missingTables = [];
    this.lastError = null;
    return true;
  }

  private resolveDatabaseUrl() {
    const configuredUrl = process.env.DATABASE_URL?.trim();

    if (!configuredUrl) {
      return null;
    }

    try {
      const url = new URL(configuredUrl);
      url.searchParams.set('schema', this.schemaName);
      return url.toString();
    } catch {
      return configuredUrl;
    }
  }

  private extractConnectionHost(connectionString: string) {
    try {
      const url = new URL(connectionString);
      return `${url.hostname}:${url.port || 'default'}`;
    } catch {
      return null;
    }
  }

  private async ensureAppSchema() {
    if (!this.client) {
      return;
    }

    await this.client.$executeRawUnsafe(
      `CREATE SCHEMA IF NOT EXISTS "${this.schemaName}"`,
    );
  }
}
