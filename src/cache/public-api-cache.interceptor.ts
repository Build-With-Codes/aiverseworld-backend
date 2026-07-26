import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { from, of } from 'rxjs';
import { switchMap, tap } from 'rxjs/operators';
import {
  PUBLIC_API_CACHEABLE_PREFIXES,
  PublicApiCacheService,
} from './public-api-cache.service';

@Injectable()
export class PublicApiCacheInterceptor implements NestInterceptor {
  private readonly logger = new Logger(PublicApiCacheInterceptor.name);

  constructor(private readonly cache: PublicApiCacheService) {}

  intercept(context: ExecutionContext, next: CallHandler) {
    const request = context.switchToHttp().getRequest<Request & { originalUrl?: string }>();
    const response = context.switchToHttp().getResponse<Response>();
    const originalUrl = request.originalUrl ?? request.url;
    const path = originalUrl.split('?')[0] || originalUrl;
    const startedAt = Date.now();
    const cacheability = this.cache.getCacheability(request.method, path);

    if (!cacheability.cacheable) {
      if (PUBLIC_API_CACHEABLE_PREFIXES.some((prefix) => path.startsWith(prefix))) {
        this.logger.log(
          `${request.method} ${originalUrl} -> DB/controller (cache skipped: ${cacheability.reason ?? 'not cacheable'})`,
        );
      }
      return next.handle();
    }

    return from(this.cache.buildKey(request.method, originalUrl)).pipe(
      switchMap((key) =>
        from(this.cache.get<unknown>(key)).pipe(
          switchMap((cached) => {
            if (cached !== null) {
              response.setHeader('X-Api-Cache', 'HIT');
              this.logger.log(`${request.method} ${originalUrl} -> Redis cache HIT (${Date.now() - startedAt}ms)`);
              return of(cached);
            }

            response.setHeader('X-Api-Cache', 'MISS');
            this.logger.log(`${request.method} ${originalUrl} -> DB/controller MISS`);
            return next.handle().pipe(
              tap((body) => {
                void this.cache.set(key, body);
                this.logger.log(
                  `${request.method} ${originalUrl} -> Redis cache SET after DB/controller (${Date.now() - startedAt}ms)`,
                );
              }),
            );
          }),
        ),
      ),
    );
  }
}
