import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { AdminBlogController, BlogController } from './blog.controller';
import { BlogService } from './blog.service';

@Module({
  imports: [DatabaseModule],
  controllers: [BlogController, AdminBlogController],
  providers: [BlogService],
})
export class BlogModule {}
