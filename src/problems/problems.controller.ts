import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ProblemsService } from './problems.service';
import type { CreateProblemInput, ProblemVote } from './problems.types';

function toNumber(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

@Controller('api/problems')
export class ProblemsController {
  constructor(private readonly problemsService: ProblemsService) {}

  @Get()
  async list(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('industry') industry?: string,
    @Query('search') search?: string,
    @Query('sort') sort?: string,
  ) {
    return this.problemsService.list({
      page: toNumber(page, 1),
      limit: toNumber(limit, 12),
      industry: industry?.trim() || undefined,
      search: search?.trim() || undefined,
      sort: this.problemsService.normalizeSort(sort),
    });
  }

  @Get(':id')
  async getById(@Param('id') id: string) {
    return {
      data: await this.problemsService.getById(id),
    };
  }

  @Post()
  async create(@Body() body: CreateProblemInput) {
    return {
      data: await this.problemsService.create(body),
    };
  }

  @Post(':id/vote')
  async vote(@Param('id') id: string, @Body() body: { vote?: ProblemVote }) {
    return {
      data: await this.problemsService.vote(id, body.vote ?? 'aiSolvable'),
    };
  }
}
