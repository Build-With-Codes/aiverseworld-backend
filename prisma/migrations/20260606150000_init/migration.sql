CREATE SCHEMA IF NOT EXISTS "aiverse_world";

CREATE TABLE IF NOT EXISTS "aiverse_world"."NewsPipelineRun" (
  "id" TEXT NOT NULL,
  "stage" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "trigger" TEXT NOT NULL,
  "message" TEXT,
  "articleCount" INTEGER NOT NULL DEFAULT 0,
  "feedCount" INTEGER NOT NULL DEFAULT 0,
  "metadata" JSONB,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finishedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "NewsPipelineRun_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "NewsPipelineRun_createdAt_idx" ON "aiverse_world"."NewsPipelineRun"("createdAt" DESC);
CREATE INDEX IF NOT EXISTS "NewsPipelineRun_status_idx" ON "aiverse_world"."NewsPipelineRun"("status");
