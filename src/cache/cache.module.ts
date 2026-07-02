import { Global, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { PublicApiCacheInterceptor } from './public-api-cache.interceptor';
import { PublicApiCacheService } from './public-api-cache.service';

@Global()
@Module({
  providers: [
    PublicApiCacheService,
    {
      provide: APP_INTERCEPTOR,
      useClass: PublicApiCacheInterceptor,
    },
  ],
  exports: [PublicApiCacheService],
})
export class CacheModule {}
