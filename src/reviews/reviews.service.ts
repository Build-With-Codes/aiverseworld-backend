import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

export type SubmitReviewInput = {
  toolId: string;
  userId: string;
  authorName: string;
  authorEmail: string;
  authorImage?: string | null;
  rating: number;
  comment: string;
};

function toDto(review: {
  id: string;
  toolId: string;
  userId: string;
  authorName: string;
  authorEmail: string;
  authorImage: string | null;
  rating: number;
  comment: string;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: review.id,
    toolId: review.toolId,
    userId: review.userId,
    author: review.authorName,
    authorImage: review.authorImage ?? undefined,
    rating: review.rating,
    comment: review.comment,
    createdAt: review.createdAt.toISOString(),
    updatedAt: review.updatedAt.toISOString(),
  };
}

@Injectable()
export class ReviewsService {
  constructor(private readonly prismaService: PrismaService) {}

  private getPrisma() {
    const prisma = this.prismaService.getClient();
    if (!prisma) {
      throw new ServiceUnavailableException('Review persistence is not configured.');
    }
    return prisma;
  }

  /** Recompute AiTool.rating/reviewCount from the live Review table. */
  private async recomputeToolRating(toolId: string) {
    const prisma = this.getPrisma();
    const agg = await prisma.review.aggregate({
      where: { toolId },
      _avg: { rating: true },
      _count: { rating: true },
    });

    await prisma.aiTool.update({
      where: { id: toolId },
      data: {
        rating: agg._count.rating > 0 ? Number((agg._avg.rating ?? 0).toFixed(2)) : null,
        reviewCount: agg._count.rating,
      },
    });
  }

  async listForTool(toolId: string, page: number, limit: number) {
    const prisma = this.getPrisma();
    const take = Math.max(1, Math.min(limit, 50));
    const skip = Math.max(0, (page - 1) * take);

    const [total, rows, distributionRows] = await Promise.all([
      prisma.review.count({ where: { toolId } }),
      prisma.review.findMany({
        where: { toolId },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      prisma.review.groupBy({
        by: ['rating'],
        where: { toolId },
        _count: { rating: true },
      }),
    ]);

    const distribution: Record<1 | 2 | 3 | 4 | 5, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    let sum = 0;
    for (const row of distributionRows) {
      const key = row.rating as 1 | 2 | 3 | 4 | 5;
      if (key >= 1 && key <= 5) distribution[key] = row._count.rating;
      sum += row.rating * row._count.rating;
    }

    return {
      data: rows.map(toDto),
      average: total > 0 ? Number((sum / total).toFixed(2)) : 0,
      total,
      distribution,
      pagination: { page, limit: take, total, totalPages: Math.max(1, Math.ceil(total / take)) },
    };
  }

  /** Admin moderation listing — across all tools, most recent first. */
  async adminList(page: number, limit: number) {
    const prisma = this.getPrisma();
    const take = Math.max(1, Math.min(limit, 100));
    const skip = Math.max(0, (page - 1) * take);

    const [total, rows] = await Promise.all([
      prisma.review.count(),
      prisma.review.findMany({
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
    ]);

    const toolIds = [...new Set(rows.map((r) => r.toolId))];
    const tools = toolIds.length
      ? await prisma.aiTool.findMany({
          where: { id: { in: toolIds } },
          select: { id: true, name: true, slug: true },
        })
      : [];
    const toolById = new Map(tools.map((t) => [t.id, t]));

    return {
      data: rows.map((row) => ({
        ...toDto(row),
        tool: toolById.get(row.toolId) ?? { id: row.toolId, name: 'Unknown tool', slug: null },
      })),
      pagination: { page, limit: take, total, totalPages: Math.max(1, Math.ceil(total / take)) },
    };
  }

  async getOwnReview(toolId: string, userId: string) {
    const prisma = this.getPrisma();
    const row = await prisma.review.findUnique({ where: { userId_toolId: { userId, toolId } } });
    return { data: row ? toDto(row) : null };
  }

  async submit(input: SubmitReviewInput) {
    if (!Number.isFinite(input.rating) || input.rating < 1 || input.rating > 5) {
      throw new BadRequestException('rating must be between 1 and 5.');
    }
    if (!input.comment || input.comment.trim().length < 10) {
      throw new BadRequestException('comment must be at least 10 characters.');
    }

    const prisma = this.getPrisma();
    const tool = await prisma.aiTool.findUnique({ where: { id: input.toolId }, select: { id: true } });
    if (!tool) throw new NotFoundException('Tool not found.');

    const row = await prisma.review.upsert({
      where: { userId_toolId: { userId: input.userId, toolId: input.toolId } },
      update: {
        rating: input.rating,
        comment: input.comment.trim(),
        authorName: input.authorName,
        authorImage: input.authorImage ?? null,
      },
      create: {
        toolId: input.toolId,
        userId: input.userId,
        authorName: input.authorName,
        authorEmail: input.authorEmail,
        authorImage: input.authorImage ?? null,
        rating: input.rating,
        comment: input.comment.trim(),
      },
    });

    await this.recomputeToolRating(input.toolId);
    return { data: toDto(row) };
  }

  async update(id: string, userId: string, rating: number, comment: string) {
    const prisma = this.getPrisma();
    const existing = await prisma.review.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Review not found.');
    if (existing.userId !== userId) throw new ForbiddenException('You can only edit your own review.');
    if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
      throw new BadRequestException('rating must be between 1 and 5.');
    }
    if (!comment || comment.trim().length < 10) {
      throw new BadRequestException('comment must be at least 10 characters.');
    }

    const row = await prisma.review.update({
      where: { id },
      data: { rating, comment: comment.trim() },
    });
    await this.recomputeToolRating(existing.toolId);
    return { data: toDto(row) };
  }

  async delete(id: string, userId: string) {
    const prisma = this.getPrisma();
    const existing = await prisma.review.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Review not found.');
    if (existing.userId !== userId) throw new ForbiddenException('You can only delete your own review.');

    await prisma.review.delete({ where: { id } });
    await this.recomputeToolRating(existing.toolId);
    return { data: { deleted: true } };
  }

  /** Admin moderation delete — no ownership check. */
  async adminDelete(id: string) {
    const prisma = this.getPrisma();
    const existing = await prisma.review.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Review not found.');

    await prisma.review.delete({ where: { id } });
    await this.recomputeToolRating(existing.toolId);
    return { data: { deleted: true } };
  }
}
