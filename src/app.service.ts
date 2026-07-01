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
        '/api/games/draw-guess',
        '/api/problems',
        '/api/tools',
        '/api/tools/recommend',
        '/api/tools/recommend/rag',
        '/api/tools/rag/reindex',
      ],
    };
  }
}
