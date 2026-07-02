import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { AdminToolsController, ToolsController } from './tools.controller';
import { CloudflareAiService } from './cloudflare-ai.service';
import { LangfuseTracingService } from './langfuse-tracing.service';
import { ToolRagIndexService } from './tool-rag-index.service';
import { ToolRagRecommendationService } from './tool-rag-recommendation.service';
import { ToolsService } from './tools.service';

@Module({
  imports: [DatabaseModule],
  controllers: [ToolsController, AdminToolsController],
  providers: [
    ToolsService,
    CloudflareAiService,
    LangfuseTracingService,
    ToolRagIndexService,
    ToolRagRecommendationService,
  ],
})
export class ToolsModule {}
