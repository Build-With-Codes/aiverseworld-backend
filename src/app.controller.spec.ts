import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';

describe('AppController', () => {
  let appController: AppController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [AppService],
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
        ],
      });
    });
  });
});
