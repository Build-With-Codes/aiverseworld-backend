import { Controller, Get, Param, Query } from '@nestjs/common';
import { SeoService } from './seo.service';

@Controller('api/seo')
export class SeoController {
  constructor(private readonly seoService: SeoService) {}

  @Get()
  async getSeo(
    @Query('type') type?: string,
    @Query('slug') slug?: string,
    @Query('query') query?: string,
    @Query('id') id?: string,
  ) {
    return {
      data: await this.seoService.getSeo({ type, slug, query, id }),
    };
  }

  @Get('sitemap/:section')
  async getSitemap(@Param('section') section: string) {
    return {
      data: await this.seoService.getSitemap(section),
    };
  }
}
