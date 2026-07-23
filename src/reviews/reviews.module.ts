import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import {
  AdminReviewsController,
  MeReviewsController,
  ToolReviewsController,
} from './reviews.controller';
import { ReviewsService } from './reviews.service';

@Module({
  imports: [DatabaseModule],
  controllers: [ToolReviewsController, MeReviewsController, AdminReviewsController],
  providers: [ReviewsService],
})
export class ReviewsModule {}
