import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import { BooksService } from './books.service';

@Controller('api/books')
export class BooksController {
  constructor(private readonly booksService: BooksService) {}

  @Get('recommendations')
  recommendations(
    @Query('type') type?: string,
    @Query('key') key?: string,
    @Query('limit') limit?: string,
  ) {
    if (type !== 'tool' && type !== 'blog') {
      throw new BadRequestException('type must be "tool" or "blog".');
    }

    if (!key?.trim()) {
      throw new BadRequestException('key is required.');
    }

    return this.booksService.getRecommendations({
      type,
      key: key.trim(),
      limit: limit ? Number(limit) : 4,
    });
  }
}
