import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Post,
  Query,
  UnauthorizedException,
} from '@nestjs/common';
import { BlogService, type AdminBlogInput } from './blog.service';

function assertAdmin(headers: Record<string, string | string[] | undefined>) {
  const configuredKey = process.env.ADMIN_API_KEY?.trim();
  if (!configuredKey) {
    if (process.env.NODE_ENV === 'production') {
      throw new UnauthorizedException('ADMIN_API_KEY is not configured.');
    }
    return;
  }
  const rawKey = headers['x-admin-api-key'];
  const key = Array.isArray(rawKey) ? rawKey[0] : rawKey;
  const rawAuth = headers.authorization;
  const auth = Array.isArray(rawAuth) ? rawAuth[0] : rawAuth;
  const bearer = auth?.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (key !== configuredKey && bearer !== configuredKey) {
    throw new UnauthorizedException('Invalid admin API key.');
  }
}

@Controller('api/blog')
export class BlogController {
  constructor(private readonly blogService: BlogService) {}

  @Get()
  list(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('category') category?: string,
    @Query('tag') tag?: string,
  ) {
    return this.blogService.list({
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 24,
      category: category?.trim() || undefined,
      tag: tag?.trim() || undefined,
    });
  }

  @Get('slugs')
  slugs() {
    return this.blogService.getSlugs();
  }

  @Get(':slug/related')
  related(@Param('slug') slug: string, @Query('limit') limit?: string) {
    return this.blogService.getRelated(slug, limit ? Number(limit) : 3);
  }

  @Get(':slug')
  bySlug(@Param('slug') slug: string) {
    return this.blogService.getBySlug(slug);
  }
}

@Controller('api/admin/blog')
export class AdminBlogController {
  constructor(private readonly blogService: BlogService) {}

  @Get()
  list(
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    assertAdmin(headers);
    return this.blogService.adminList({
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 24,
    });
  }

  @Get(':slug')
  bySlug(
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Param('slug') slug: string,
  ) {
    assertAdmin(headers);
    return this.blogService.adminGetBySlug(slug);
  }

  @Post()
  create(
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Body() body: AdminBlogInput,
  ) {
    assertAdmin(headers);
    if (!body?.title || !body?.content || !body?.category) {
      throw new BadRequestException('title, content, and category are required.');
    }
    return this.blogService.upsert(body);
  }

  @Post('bulk')
  bulk(
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Body() body: AdminBlogInput[] | { posts?: AdminBlogInput[] },
  ) {
    assertAdmin(headers);
    const posts = Array.isArray(body) ? body : body.posts;
    if (!Array.isArray(posts) || posts.length === 0) {
      throw new BadRequestException('Send a non-empty posts array.');
    }
    return Promise.all(posts.map((post) => this.blogService.upsert(post)));
  }

  @Delete(':slug')
  remove(
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Param('slug') slug: string,
  ) {
    assertAdmin(headers);
    return this.blogService.delete(slug);
  }
}
