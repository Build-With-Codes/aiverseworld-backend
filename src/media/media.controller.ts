import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  NotFoundException,
  Param,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { MediaService, type MediaMeta } from './media.service';

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

@Controller('api/media')
export class MediaController {
  constructor(private readonly mediaService: MediaService) {}

  @Get(':id')
  async get(@Param('id') id: string) {
    const media = await this.mediaService.getById(id);
    if (!media) throw new NotFoundException('Media not found.');
    return { data: media };
  }
}

@Controller('api/admin/media')
export class AdminMediaController {
  constructor(private readonly mediaService: MediaService) {}

  @Post('ingest-url')
  async ingestUrl(
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Body() body: { url?: string } & MediaMeta,
  ) {
    assertAdmin(headers);
    if (!body?.url) throw new BadRequestException('url is required.');
    return { data: await this.mediaService.ingestFromUrl(body.url, body) };
  }

  @Post('upload')
  async upload(
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Body() body: { data?: string } & MediaMeta,
  ) {
    assertAdmin(headers);
    if (!body?.data) throw new BadRequestException('Base64 image `data` is required.');
    return { data: await this.mediaService.ingestFromBase64(body.data, body) };
  }
}
