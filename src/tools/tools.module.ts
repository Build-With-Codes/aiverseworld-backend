import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { AdminToolsController, ToolsController } from './tools.controller';
import { MeController } from './me.controller';
import { CloudflareAiService } from './cloudflare-ai.service';
import { EngagementService } from './engagement.service';
import { StatsSchedulerService } from './stats.scheduler';
import { LangfuseTracingService } from './langfuse-tracing.service';
import { ToolRagIndexService } from './tool-rag-index.service';
import { ToolRagRecommendationService } from './tool-rag-recommendation.service';
import { ToolsService } from './tools.service';

@Module({
  imports: [DatabaseModule],
  controllers: [ToolsController, AdminToolsController, MeController],
  providers: [
    ToolsService,
    CloudflareAiService,
    EngagementService,
    StatsSchedulerService,
    LangfuseTracingService,
    ToolRagIndexService,
    ToolRagRecommendationService,
  ],
})
export class ToolsModule {}
