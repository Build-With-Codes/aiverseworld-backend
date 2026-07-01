import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaService } from './database/prisma.service';

describe('AppController', () => {
  let appController: AppController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        AppService,
        {
          provide: PrismaService,
          useValue: {
            getStatus: () => ({
              configured: false,
              connected: false,
              lastError: null,
              database: null,
              missingTables: [],
            }),
          },
        },
      ],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('root', () => {
    it('should return API metadata', () => {
      expect(appController.getHello()).toEqual({
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
        ],
      });
    });
  });

  describe('health', () => {
    it('should return database diagnostics', () => {
      expect(appController.health()).toEqual({
        status: 'degraded',
        database: {
          configured: false,
          connected: false,
          lastError: null,
          database: null,
          missingTables: [],
        },
      });
    });
  });
});
