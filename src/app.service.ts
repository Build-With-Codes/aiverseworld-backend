import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getHello() {
    return {
      name: 'AiverseWorld News API',
      version: '1.0.0',
      endpoints: [
        '/api/news',
        '/api/news/health',
        '/api/news/runs',
        '/api/news/sources',
        '/api/news/refresh',
        '/api/news/refresh/cron',
      ],
    };
  }
}
