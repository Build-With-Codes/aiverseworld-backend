import { Controller, Headers, Post, UnauthorizedException } from '@nestjs/common';
import { PublicApiCacheService } from './public-api-cache.service';

function assertAdmin(headers: Record<string, string | string[] | undefined>) {
  const configuredKey = process.env.ADMIN_API_KEY?.trim();

  if (!configuredKey) {
    if (process.env.NODE_ENV === 'production') {
      throw new UnauthorizedException('ADMIN_API_KEY is not configured.');
    }

    return;
  }

  const rawAdminKey = headers['x-admin-api-key'];
  const adminKey = Array.isArray(rawAdminKey) ? rawAdminKey[0] : rawAdminKey;
  const rawAuthorization = headers.authorization;
  const authorization = Array.isArray(rawAuthorization)
    ? rawAuthorization[0]
    : rawAuthorization;
  const bearerToken = authorization?.startsWith('Bearer ')
    ? authorization.slice('Bearer '.length).trim()
    : '';

  if (adminKey !== configuredKey && bearerToken !== configuredKey) {
    throw new UnauthorizedException('Invalid admin API key.');
  }
}

@Controller('api/admin/cache')
export class CacheAdminController {
  constructor(private readonly cacheService: PublicApiCacheService) {}

  @Post('reset')
  reset(@Headers() headers: Record<string, string | string[] | undefined>) {
    assertAdmin(headers);
    return this.cacheService.reset('admin manual reset');
  }
}
