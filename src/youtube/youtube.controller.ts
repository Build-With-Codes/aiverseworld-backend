import { Controller, Get, Param, Query } from '@nestjs/common';
import { YoutubeService } from './youtube.service';

@Controller('api/youtube')
export class YoutubeController {
  constructor(private readonly youtubeService: YoutubeService) {}

  @Get(':toolKey')
  getToolVideos(
    @Param('toolKey') toolKey: string,
    @Query('limit') limit?: string,
  ) {
    return this.youtubeService.getToolVideos(toolKey, limit ? Number(limit) : 3);
  }
}
