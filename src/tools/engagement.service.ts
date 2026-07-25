import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { ToolsService } from './tools.service';
import { spotlightSlots, type SpotlightSlot } from './spotlight.config';
import { collectionDefs, findCollection } from './collections.config';

function jsonToStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function dayOfYear(date: Date): number {
  const start = Date.UTC(date.getUTCFullYear(), 0, 0);
  const diff = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) - start;
  return Math.floor(diff / (24 * 60 * 60_000));
}

function weekOfYear(date: Date): number {
  return Math.floor(dayOfYear(date) / 7);
}

export type ToolEventType =
  | 'view'
  | 'save'
  | 'unsave'
  | 'compare'
  | 'search'
  | 'click';

const EVENT_TYPES: ToolEventType[] = [
  'view',
  'save',
  'unsave',
  'compare',
  'search',
  'click',
];

export type RecordEventInput = {
  type: string;
  toolId?: string | null;
  userId?: string | null;
  anonId?: string | null;
  query?: string | null;
  metadata?: Record<string, unknown> | null;
};

// De-dupe window for high-frequency events (views) from the same identity.
const VIEW_DEDUPE_MINUTES = 30;

@Injectable()
export class EngagementService {
  private readonly logger = new Logger(EngagementService.name);

  constructor(
    private readonly prismaService: PrismaService,
    private readonly toolsService: ToolsService,
  ) {}

  private getPrisma() {
    const prisma = this.prismaService.getClient();

    if (!prisma) {
      throw new ServiceUnavailableException(
        'Engagement persistence is not configured.',
      );
    }

    return prisma;
  }

  normalizeEventType(value: string): ToolEventType | null {
    const lowered = value?.toLowerCase?.().trim();
    return EVENT_TYPES.includes(lowered as ToolEventType)
      ? (lowered as ToolEventType)
      : null;
  }

  /**
   * Record a single engagement event. Fire-and-forget from the caller's
   * perspective — failures are swallowed so tracking never breaks a page.
   * Returns { recorded: boolean } so callers can observe de-dupe in tests.
   */
  async recordEvent(input: RecordEventInput): Promise<{ recorded: boolean }> {
    const type = this.normalizeEventType(input.type);

    if (!type) {
      return { recorded: false };
    }

    const prisma = this.getPrisma();
    const userId = input.userId?.trim() || null;
    const anonId = input.anonId?.trim() || null;
    const toolId = input.toolId?.trim() || null;
    const query = input.query?.trim() || null;

    // Views are noisy: skip if the same identity viewed the same tool recently.
    if (type === 'view' && toolId && (userId || anonId)) {
      const since = new Date(Date.now() - VIEW_DEDUPE_MINUTES * 60_000);
      const existing = await prisma.toolEvent.findFirst({
        where: {
          type: 'view',
          toolId,
          createdAt: { gte: since },
          ...(userId ? { userId } : { anonId }),
        },
        select: { id: true },
      });

      if (existing) {
        return { recorded: false };
      }
    }

    try {
      await prisma.toolEvent.create({
        data: {
          type,
          toolId,
          userId,
          anonId,
          query,
          metadata:
            input.metadata == null
              ? Prisma.JsonNull
              : (input.metadata as Prisma.InputJsonValue),
        },
      });

      return { recorded: true };
    } catch (error) {
      this.logger.warn(
        `Failed to record ${type} event: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );
      return { recorded: false };
    }
  }

  /**
   * Aggregate the ToolEvent log into per-tool ToolStat rollups, and derive
   * AiTool.popularityScore from that same lifetime engagement. Idempotent —
   * safe to run on a schedule or on demand. trendingScore is a recency-weighted
   * blend of views, saves, and compares over the last 30 days; popularityScore
   * is a 0-100 normalization of lifetime totals with no manual/static input —
   * a tool with zero engagement gets 0.
   */
  async recomputeStats(): Promise<{ toolsUpdated: number }> {
    const prisma = this.getPrisma();
    const now = Date.now();
    const cutoff30d = new Date(now - 30 * 24 * 60 * 60_000);

    const allTools = await prisma.aiTool.findMany({ select: { id: true } });
    const validToolIds = allTools.map((tool) => tool.id);

    // A catalog re-import (or a deleted tool) leaves ToolEvent/ToolStat rows
    // pointing at ids that no longer exist. Left alone, recompute keeps
    // rolling that dead data into trending/rankings forever — hydrating those
    // ids later returns nothing, silently starving Trending. Purge first.
    await Promise.all([
      prisma.toolEvent.deleteMany({
        where: { AND: [{ toolId: { not: null } }, { toolId: { notIn: validToolIds } }] },
      }),
      prisma.toolStat.deleteMany({ where: { toolId: { notIn: validToolIds } } }),
    ]);

    const events = await prisma.toolEvent.findMany({
      where: {
        toolId: { not: null },
        type: { in: ['view', 'save', 'unsave', 'compare', 'search', 'click'] },
      },
      select: { toolId: true, type: true, createdAt: true },
    });

    const cutoff7dMs = now - 7 * 24 * 60 * 60_000;
    const cutoff30dMs = cutoff30d.getTime();

    type Acc = {
      viewsTotal: number;
      views7d: number;
      views30d: number;
      savesTotal: number;
      comparesTotal: number;
      searchHits: number;
      trendingScore: number;
    };
    const byTool = new Map<string, Acc>();

    const weight: Record<string, number> = {
      view: 1,
      save: 3,
      compare: 2,
      click: 1,
      search: 0.5,
      unsave: 0,
    };

    for (const event of events) {
      const toolId = event.toolId as string;
      const acc =
        byTool.get(toolId) ??
        ({
          viewsTotal: 0,
          views7d: 0,
          views30d: 0,
          savesTotal: 0,
          comparesTotal: 0,
          searchHits: 0,
          trendingScore: 0,
        } satisfies Acc);

      const createdMs = event.createdAt.getTime();

      if (event.type === 'view') {
        acc.viewsTotal += 1;
        if (createdMs >= cutoff7dMs) acc.views7d += 1;
        if (createdMs >= cutoff30dMs) acc.views30d += 1;
      } else if (event.type === 'save') {
        acc.savesTotal += 1;
      } else if (event.type === 'unsave') {
        acc.savesTotal = Math.max(0, acc.savesTotal - 1);
      } else if (event.type === 'compare') {
        acc.comparesTotal += 1;
      } else if (event.type === 'search') {
        acc.searchHits += 1;
      }

      // Recency-weighted trending contribution (7-day half-life) over 30d window.
      if (createdMs >= cutoff30dMs && event.type !== 'unsave') {
        const ageDays = (now - createdMs) / (24 * 60 * 60_000);
        const decay = Math.pow(0.5, ageDays / 7);
        acc.trendingScore += (weight[event.type] ?? 0) * decay;
      }

      byTool.set(toolId, acc);
    }

    const entries = Array.from(byTool.entries());

    // Lifetime popularity (distinct from the recency-decayed trendingScore
    // above): a fixed-weight blend of totals, min-max normalized to 0-100
    // across the current catalog so it stays comparable over time.
    const popularityWeight = { view: 1, save: 5, compare: 3, search: 1 };
    const rawPopularity = new Map<string, number>();
    let maxRawPopularity = 0;
    for (const [toolId, acc] of entries) {
      const raw =
        acc.viewsTotal * popularityWeight.view +
        acc.savesTotal * popularityWeight.save +
        acc.comparesTotal * popularityWeight.compare +
        acc.searchHits * popularityWeight.search;
      rawPopularity.set(toolId, raw);
      if (raw > maxRawPopularity) maxRawPopularity = raw;
    }

    const popularityUpdates = allTools.map(({ id }) => {
      const raw = rawPopularity.get(id) ?? 0;
      const score = maxRawPopularity > 0 ? Math.round((raw / maxRawPopularity) * 100) : 0;
      return { id, score };
    });

    await prisma.$transaction(
      entries.map(([toolId, acc]) =>
        prisma.toolStat.upsert({
          where: { toolId },
          create: {
            toolId,
            viewsTotal: acc.viewsTotal,
            views7d: acc.views7d,
            views30d: acc.views30d,
            savesTotal: acc.savesTotal,
            comparesTotal: acc.comparesTotal,
            searchHits: acc.searchHits,
            trendingScore: Number(acc.trendingScore.toFixed(4)),
          },
          update: {
            viewsTotal: acc.viewsTotal,
            views7d: acc.views7d,
            views30d: acc.views30d,
            savesTotal: acc.savesTotal,
            comparesTotal: acc.comparesTotal,
            searchHits: acc.searchHits,
            trendingScore: Number(acc.trendingScore.toFixed(4)),
          },
        }),
      ),
      { timeout: 15_000 },
    );

    // One batched UPDATE instead of one round trip per tool — with a
    // catalog of hundreds of tools, N individual prisma.aiTool.update()
    // calls inside a $transaction blew past Prisma's interactive-transaction
    // timeout in production (P2028). This is a single statement either way.
    if (popularityUpdates.length > 0) {
      const values = Prisma.join(
        popularityUpdates.map(({ id, score }) => Prisma.sql`(${id}::text, ${score}::int)`),
      );
      await prisma.$executeRaw`
        UPDATE "aiverse_world"."AiTool" AS t
        SET "popularityScore" = v.score
        FROM (VALUES ${values}) AS v(id, score)
        WHERE t.id = v.id
      `;
    }

    return { toolsUpdated: entries.length };
  }

  // ── E3: dynamic discovery ─────────────────────────────────────────────

  /**
   * Trending tools. Uses recency-weighted ToolStat when events exist, and
   * falls back to catalog popularity so a fresh deploy is never empty.
   */
  async getTrending(window: string, limit: number) {
    const prisma = this.getPrisma();
    const take = Math.max(1, Math.min(limit, 50));
    const orderBy: Prisma.ToolStatOrderByWithRelationInput =
      window === '30d'
        ? { views30d: 'desc' }
        : window === 'today'
          ? { trendingScore: 'desc' }
          : { trendingScore: 'desc' };

    const stats = await prisma.toolStat.findMany({
      where: { trendingScore: { gt: 0 } },
      orderBy,
      take,
      select: { toolId: true },
    });

    if (stats.length >= Math.min(take, 3)) {
      return this.toolsService.hydrateByIds(stats.map((s) => s.toolId));
    }

    // Fallback: popularity-ranked catalog.
    const rows = await prisma.aiTool.findMany({
      orderBy: [{ popularityScore: 'desc' }, { rating: 'desc' }],
      take,
      select: { id: true },
    });
    return this.toolsService.hydrateByIds(rows.map((r) => r.id));
  }

  /** Rankings by a saved/compared/searched metric, with popularity fallback. */
  async getRankings(metric: string, limit: number) {
    const prisma = this.getPrisma();
    const take = Math.max(1, Math.min(limit, 50));
    const field =
      metric === 'most-saved'
        ? 'savesTotal'
        : metric === 'most-compared'
          ? 'comparesTotal'
          : metric === 'most-searched'
            ? 'searchHits'
            : 'savesTotal';

    const stats = await prisma.toolStat.findMany({
      where: { [field]: { gt: 0 } } as Prisma.ToolStatWhereInput,
      orderBy: { [field]: 'desc' } as Prisma.ToolStatOrderByWithRelationInput,
      take,
      select: { toolId: true },
    });

    if (stats.length >= Math.min(take, 3)) {
      return this.toolsService.hydrateByIds(stats.map((s) => s.toolId));
    }

    const rows = await prisma.aiTool.findMany({
      orderBy: [{ popularityScore: 'desc' }, { rating: 'desc' }],
      take,
      select: { id: true },
    });
    return this.toolsService.hydrateByIds(rows.map((r) => r.id));
  }

  /**
   * Related/similar tools via catalog overlap scoring (category, subcategory,
   * tags, audience, modalities). Fast and deterministic — no LLM cost per page.
   */
  async getRelated(toolId: string, limit: number) {
    const prisma = this.getPrisma();
    const take = Math.max(1, Math.min(limit, 24));

    const source = await prisma.aiTool.findUnique({ where: { id: toolId } });
    if (!source) {
      return [];
    }

    const candidates = await prisma.aiTool.findMany({
      where: { id: { not: source.id } },
      select: {
        id: true,
        category: true,
        subcategory: true,
        tags: true,
        targetAudience: true,
        modalities: true,
        popularityScore: true,
      },
    });

    const srcTags = new Set(jsonToStringArray(source.tags));
    const srcAudience = new Set(jsonToStringArray(source.targetAudience));
    const srcModalities = new Set(jsonToStringArray(source.modalities));

    const overlap = (set: Set<string>, arr: string[]) =>
      arr.reduce((n, item) => n + (set.has(item) ? 1 : 0), 0);

    const scored = candidates
      .map((candidate) => {
        let score = 0;
        if (candidate.category === source.category) score += 5;
        if (candidate.subcategory === source.subcategory) score += 3;
        score += overlap(srcTags, jsonToStringArray(candidate.tags)) * 2;
        score += overlap(srcAudience, jsonToStringArray(candidate.targetAudience));
        score += overlap(srcModalities, jsonToStringArray(candidate.modalities));
        // Gentle tie-breaker toward more popular tools.
        score += (candidate.popularityScore ?? 0) / 1000;
        return { id: candidate.id, score };
      })
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, take);

    return this.toolsService.hydrateByIds(scored.map((entry) => entry.id));
  }

  /** Date-seeded spotlights (Tool of Day/Week/Month + rising/editors/rated). */
  async getSpotlights() {
    const prisma = this.getPrisma();

    const pool = await prisma.aiTool.findMany({
      orderBy: [{ popularityScore: 'desc' }, { rating: 'desc' }],
      take: 60,
      select: { id: true, slug: true, rating: true },
    });

    if (pool.length === 0) {
      return { data: [] };
    }

    const trendingStats = await prisma.toolStat.findMany({
      where: { trendingScore: { gt: 0 } },
      orderBy: { trendingScore: 'desc' },
      take: 10,
      select: { toolId: true },
    });
    const trendingIds = trendingStats.map((s) => s.toolId).filter(Boolean);

    const now = new Date();
    const used = new Set<string>();

    const pickBySeed = (seed: number): string => {
      const len = pool.length;
      for (let i = 0; i < len; i += 1) {
        const candidate = pool[(seed + i) % len];
        if (!used.has(candidate.id)) {
          used.add(candidate.id);
          return candidate.id;
        }
      }
      return pool[seed % len].id;
    };

    const resolveSlot = (slot: SpotlightSlot): string => {
      if (slot.pinnedSlug) {
        const pinned = pool.find((p) => p.slug === slot.pinnedSlug);
        if (pinned && !used.has(pinned.id)) {
          used.add(pinned.id);
          return pinned.id;
        }
      }

      switch (slot.strategy) {
        case 'daily':
          return pickBySeed(dayOfYear(now));
        case 'weekly':
          return pickBySeed(weekOfYear(now) * 3 + 1);
        case 'monthly':
          return pickBySeed(now.getUTCMonth() * 5 + 2);
        case 'rising': {
          const rising = trendingIds.find((id) => !used.has(id));
          if (rising) {
            used.add(rising);
            return rising;
          }
          return pickBySeed(dayOfYear(now) + 7);
        }
        case 'highest-rated': {
          const topRated = [...pool].sort(
            (a, b) => (b.rating ?? 0) - (a.rating ?? 0),
          );
          const pick = topRated.find((p) => !used.has(p.id));
          if (pick) {
            used.add(pick.id);
            return pick.id;
          }
          return pickBySeed(0);
        }
        case 'editors-choice':
        default:
          return pickBySeed(0);
      }
    };

    const slotIds = spotlightSlots.map((slot) => resolveSlot(slot));
    const tools = await this.toolsService.hydrateByIds(slotIds);
    const byId = new Map(tools.map((tool) => [tool.id, tool]));

    const data = spotlightSlots
      .map((slot, index) => {
        const tool = byId.get(slotIds[index]);
        if (!tool) return null;
        return {
          key: slot.key,
          emoji: slot.emoji,
          label: slot.label,
          blurb: slot.blurb,
          tool,
        };
      })
      .filter((entry): entry is NonNullable<typeof entry> => entry !== null);

    return { data };
  }

  /** All collections (metadata only — no tool hydration for the index). */
  getCollections() {
    return {
      data: collectionDefs.map((collection) => ({
        slug: collection.slug,
        emoji: collection.emoji,
        title: collection.title,
        tagline: collection.tagline,
      })),
    };
  }

  /** A single collection with its resolved, ordered tools. */
  async getCollection(slug: string) {
    const collection = findCollection(slug);
    if (!collection) {
      return { data: null };
    }

    const prisma = this.getPrisma();
    const limit = collection.limit ?? 12;
    let toolIds: string[] = [];

    if (collection.toolSlugs && collection.toolSlugs.length > 0) {
      const rows = await prisma.aiTool.findMany({
        where: { slug: { in: collection.toolSlugs } },
        select: { id: true, slug: true },
      });
      const bySlug = new Map(rows.map((r) => [r.slug, r.id]));
      toolIds = collection.toolSlugs
        .map((s) => bySlug.get(s))
        .filter((id): id is string => Boolean(id));
    } else {
      const where: Prisma.AiToolWhereInput = {};
      if (collection.categories && collection.categories.length > 0) {
        where.category = { in: collection.categories };
      }
      if (collection.filter?.freeOnly) {
        where.freePlan = { in: ['Yes', 'Limited'] };
      }
      if (collection.filter?.openSourceOnly) {
        where.openSource = true;
      }
      const rows = await prisma.aiTool.findMany({
        where,
        orderBy: [{ popularityScore: 'desc' }, { rating: 'desc' }],
        take: limit,
        select: { id: true },
      });
      toolIds = rows.map((r) => r.id);
    }

    const tools = await this.toolsService.hydrateByIds(toolIds);

    return {
      data: {
        slug: collection.slug,
        emoji: collection.emoji,
        title: collection.title,
        tagline: collection.tagline,
        intro: collection.intro,
        body: collection.body,
        buyingGuide: collection.buyingGuide,
        faqs: collection.faqs,
        seoTitle: collection.seoTitle,
        seoDescription: collection.seoDescription,
        tools,
      },
    };
  }

  // ── E4: per-user engagement (caller must be trusted; userId verified) ──

  async getSaved(userId: string) {
    const prisma = this.getPrisma();
    const saved = await prisma.savedTool.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: { toolId: true },
    });
    return this.toolsService.hydrateByIds(saved.map((s) => s.toolId));
  }

  async isSaved(userId: string, toolId: string) {
    const prisma = this.getPrisma();
    const row = await prisma.savedTool.findUnique({
      where: { userId_toolId: { userId, toolId } },
      select: { id: true },
    });
    return Boolean(row);
  }

  async saveTool(userId: string, toolId: string) {
    const prisma = this.getPrisma();
    await prisma.savedTool.upsert({
      where: { userId_toolId: { userId, toolId } },
      create: { userId, toolId },
      update: {},
    });
    await this.recordEvent({ type: 'save', toolId, userId });
    return { saved: true };
  }

  async unsaveTool(userId: string, toolId: string) {
    const prisma = this.getPrisma();
    await prisma.savedTool
      .delete({ where: { userId_toolId: { userId, toolId } } })
      .catch(() => undefined);
    await this.recordEvent({ type: 'unsave', toolId, userId });
    return { saved: false };
  }

  async getRecentlyViewed(userId: string, limit: number) {
    const prisma = this.getPrisma();
    const take = Math.max(1, Math.min(limit, 30));
    const events = await prisma.toolEvent.findMany({
      where: { userId, type: 'view', toolId: { not: null } },
      orderBy: { createdAt: 'desc' },
      distinct: ['toolId'],
      take,
      select: { toolId: true },
    });
    return this.toolsService.hydrateByIds(
      events.map((e) => e.toolId).filter((id): id is string => Boolean(id)),
    );
  }

  async getFollows(userId: string) {
    const prisma = this.getPrisma();
    const rows = await prisma.followedCategory.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: { category: true },
    });
    return rows.map((r) => r.category);
  }

  async followCategory(userId: string, category: string) {
    const prisma = this.getPrisma();
    await prisma.followedCategory.upsert({
      where: { userId_category: { userId, category } },
      create: { userId, category },
      update: {},
    });
    return { following: true };
  }

  async unfollowCategory(userId: string, category: string) {
    const prisma = this.getPrisma();
    await prisma.followedCategory
      .delete({ where: { userId_category: { userId, category } } })
      .catch(() => undefined);
    return { following: false };
  }

  /**
   * Personalized recommendations blended from the user's saved tools, recently
   * viewed categories, and followed categories. Falls back to popularity.
   */
  async getRecommendations(userId: string, limit: number) {
    const prisma = this.getPrisma();
    const take = Math.max(1, Math.min(limit, 24));

    const [saved, viewed, follows] = await Promise.all([
      prisma.savedTool.findMany({ where: { userId }, select: { toolId: true } }),
      prisma.toolEvent.findMany({
        where: { userId, type: 'view', toolId: { not: null } },
        orderBy: { createdAt: 'desc' },
        distinct: ['toolId'],
        take: 20,
        select: { toolId: true },
      }),
      prisma.followedCategory.findMany({
        where: { userId },
        select: { category: true },
      }),
    ]);

    const seenIds = new Set<string>([
      ...saved.map((s) => s.toolId),
      ...viewed.map((v) => v.toolId).filter((id): id is string => Boolean(id)),
    ]);

    // Signal categories: followed + categories of saved/viewed tools.
    const signalIds = Array.from(seenIds);
    const signalTools =
      signalIds.length > 0
        ? await prisma.aiTool.findMany({
            where: { id: { in: signalIds } },
            select: { category: true },
          })
        : [];
    const categories = new Set<string>([
      ...follows.map((f) => f.category),
      ...signalTools.map((t) => t.category),
    ]);

    if (categories.size === 0) {
      // No signal yet — return popular tools.
      const rows = await prisma.aiTool.findMany({
        orderBy: [{ popularityScore: 'desc' }, { rating: 'desc' }],
        take,
        select: { id: true },
      });
      return this.toolsService.hydrateByIds(rows.map((r) => r.id));
    }

    const rows = await prisma.aiTool.findMany({
      where: {
        category: { in: Array.from(categories) },
        id: { notIn: signalIds.length > 0 ? signalIds : ['__none__'] },
      },
      orderBy: [{ popularityScore: 'desc' }, { rating: 'desc' }],
      take,
      select: { id: true },
    });
    return this.toolsService.hydrateByIds(rows.map((r) => r.id));
  }

  private async computeStreak(userId: string): Promise<number> {
    const prisma = this.getPrisma();
    const since = new Date(Date.now() - 60 * 24 * 60 * 60_000);
    const events = await prisma.toolEvent.findMany({
      where: { userId, createdAt: { gte: since } },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });

    const days = new Set(
      events.map((e) => e.createdAt.toISOString().slice(0, 10)),
    );
    if (days.size === 0) return 0;

    let streak = 0;
    const cursor = new Date();
    // Allow the streak to count if the user was active today or yesterday.
    const todayKey = cursor.toISOString().slice(0, 10);
    if (!days.has(todayKey)) {
      cursor.setUTCDate(cursor.getUTCDate() - 1);
    }
    for (;;) {
      const key = cursor.toISOString().slice(0, 10);
      if (days.has(key)) {
        streak += 1;
        cursor.setUTCDate(cursor.getUTCDate() - 1);
      } else {
        break;
      }
    }
    return streak;
  }

  async getDashboard(userId: string) {
    const prisma = this.getPrisma();

    const [saved, recentlyViewed, follows, recommendations, comparedCount, streak] =
      await Promise.all([
        this.getSaved(userId),
        this.getRecentlyViewed(userId, 12),
        this.getFollows(userId),
        this.getRecommendations(userId, 6),
        prisma.toolEvent.count({ where: { userId, type: 'compare' } }),
        this.computeStreak(userId),
      ]);

    return {
      data: {
        saved,
        savedCount: saved.length,
        recentlyViewed,
        follows,
        recommendations,
        comparedCount,
        streak,
      },
    };
  }
}
