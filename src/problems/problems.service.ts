import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import type {
  CreateProblemInput,
  ListProblemsInput,
  ProblemSort,
  ProblemVote,
} from './problems.types';

function clampNumber(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function normalizeProblem(problem: {
  id: string;
  title: string;
  description: string;
  industry: string;
  frequency: string;
  painScore: number;
  email: string | null;
  aiSolvable: number;
  notAiSolvable: number;
  createdAt: Date;
  updatedAt: Date;
}) {
  const totalVotes = problem.aiSolvable + problem.notAiSolvable;

  return {
    id: problem.id,
    title: problem.title,
    description: problem.description,
    industry: problem.industry,
    frequency: problem.frequency,
    painScore: problem.painScore,
    email: problem.email ?? undefined,
    createdAt: problem.createdAt.toISOString(),
    updatedAt: problem.updatedAt.toISOString(),
    votes: {
      aiSolvable: problem.aiSolvable,
      notAiSolvable: problem.notAiSolvable,
    },
    voteSummary: {
      total: totalVotes,
      aiScore: totalVotes ? Math.round((problem.aiSolvable / totalVotes) * 100) : 0,
    },
  };
}

function isProblemSort(value: string): value is ProblemSort {
  return ['newest', 'oldest', 'pain', 'ai-score'].includes(value);
}

@Injectable()
export class ProblemsService {
  constructor(private readonly prismaService: PrismaService) {}

  private getPrisma() {
    const prisma = this.prismaService.getClient();

    if (!prisma) {
      throw new ServiceUnavailableException('Problem persistence is not configured.');
    }

    return prisma;
  }

  async list(input: ListProblemsInput) {
    const prisma = this.getPrisma();
    const page = clampNumber(input.page, 1, 10_000);
    const limit = clampNumber(input.limit, 1, 50);
    const where: Prisma.ProblemWhereInput = {};

    if (input.industry) {
      where.industry = { equals: input.industry, mode: 'insensitive' };
    }

    if (input.search) {
      where.OR = [
        { title: { contains: input.search, mode: 'insensitive' } },
        { description: { contains: input.search, mode: 'insensitive' } },
        { industry: { contains: input.search, mode: 'insensitive' } },
      ];
    }

    const orderBy: Prisma.ProblemOrderByWithRelationInput[] =
      input.sort === 'oldest'
        ? [{ createdAt: 'asc' }]
        : input.sort === 'pain'
          ? [{ painScore: 'desc' }, { createdAt: 'desc' }]
          : input.sort === 'ai-score'
            ? [{ aiSolvable: 'desc' }, { createdAt: 'desc' }]
            : [{ createdAt: 'desc' }];

    const [total, problems, industries] = await Promise.all([
      prisma.problem.count({ where }),
      prisma.problem.findMany({
        where,
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.problem.findMany({
        distinct: ['industry'],
        orderBy: { industry: 'asc' },
        select: { industry: true },
      }),
    ]);

    return {
      data: problems.map(normalizeProblem),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
      filters: {
        industries: industries.map((item) => item.industry),
      },
    };
  }

  async getById(id: string) {
    const problem = await this.getPrisma().problem.findUnique({
      where: { id },
    });

    if (!problem) {
      throw new NotFoundException('Problem not found.');
    }

    return normalizeProblem(problem);
  }

  async create(input: CreateProblemInput) {
    if (!input.title || !input.description || !input.industry || !input.frequency) {
      throw new BadRequestException('Missing required problem fields.');
    }

    const painScore = clampNumber(Number(input.painScore), 1, 10);

    const problem = await this.getPrisma().problem.create({
      data: {
        title: input.title.trim(),
        description: input.description.trim(),
        industry: input.industry.trim(),
        frequency: input.frequency.trim(),
        painScore,
        email: input.email?.trim() || null,
      },
    });

    return normalizeProblem(problem);
  }

  async vote(id: string, vote: ProblemVote) {
    if (vote !== 'aiSolvable' && vote !== 'notAiSolvable') {
      throw new BadRequestException('Invalid vote.');
    }

    try {
      const problem = await this.getPrisma().problem.update({
        where: { id },
        data: {
          [vote]: {
            increment: 1,
          },
        },
      });

      return normalizeProblem(problem);
    } catch {
      throw new NotFoundException('Problem not found.');
    }
  }

  normalizeSort(value?: string): ProblemSort {
    return value && isProblemSort(value) ? value : 'newest';
  }
}
