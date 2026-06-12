import { Body, Controller, Get, Headers, Post, Query } from '@nestjs/common';
import { EnglishTutorService } from './english-tutor.service';
import type {
  EnglishTutorRealtimeRequest,
  EnglishTutorSaveTurnRequest,
  EnglishTutorTurnRequest,
} from './english-tutor.types';

@Controller('api/english-tutor')
export class EnglishTutorController {
  constructor(private readonly englishTutorService: EnglishTutorService) {}

  @Post('turn')
  createTurn(@Body() body: EnglishTutorTurnRequest) {
    return this.englishTutorService.createTurn(body);
  }

  @Post('realtime-session')
  createRealtimeSession(@Body() body: EnglishTutorRealtimeRequest) {
    return this.englishTutorService.createRealtimeSession(body);
  }

  @Post('realtime-call')
  async createRealtimeCall(
    @Body() sdpOffer: string,
    @Headers('x-tutor-focus') focus?: string,
    @Headers('x-tutor-user-id') userId?: string,
  ) {
    return this.englishTutorService.createRealtimeCall(sdpOffer, {
      focus,
      userId,
    });
  }

  @Post('turns')
  saveTurn(@Body() body: EnglishTutorSaveTurnRequest) {
    return this.englishTutorService.saveTurn(body);
  }

  @Get('progress')
  getProgress(@Query('userId') userId?: string) {
    return this.englishTutorService.getProgress(userId);
  }
}
