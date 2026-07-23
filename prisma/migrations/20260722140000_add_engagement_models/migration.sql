CREATE TABLE IF NOT EXISTS "aiverse_world"."ToolEvent" (
  "id" TEXT NOT NULL,
  "toolId" TEXT,
  "userId" TEXT,
  "anonId" TEXT,
  "type" TEXT NOT NULL,
  "query" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ToolEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ToolEvent_type_createdAt_idx"
  ON "aiverse_world"."ToolEvent"("type", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "ToolEvent_toolId_type_idx"
  ON "aiverse_world"."ToolEvent"("toolId", "type");
CREATE INDEX IF NOT EXISTS "ToolEvent_userId_type_createdAt_idx"
  ON "aiverse_world"."ToolEvent"("userId", "type", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "ToolEvent_anonId_type_createdAt_idx"
  ON "aiverse_world"."ToolEvent"("anonId", "type", "createdAt" DESC);

CREATE TABLE IF NOT EXISTS "aiverse_world"."ToolStat" (
  "toolId" TEXT NOT NULL,
  "viewsTotal" INTEGER NOT NULL DEFAULT 0,
  "views7d" INTEGER NOT NULL DEFAULT 0,
  "views30d" INTEGER NOT NULL DEFAULT 0,
  "savesTotal" INTEGER NOT NULL DEFAULT 0,
  "comparesTotal" INTEGER NOT NULL DEFAULT 0,
  "searchHits" INTEGER NOT NULL DEFAULT 0,
  "trendingScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ToolStat_pkey" PRIMARY KEY ("toolId")
);

CREATE INDEX IF NOT EXISTS "ToolStat_trendingScore_idx"
  ON "aiverse_world"."ToolStat"("trendingScore" DESC);
CREATE INDEX IF NOT EXISTS "ToolStat_savesTotal_idx"
  ON "aiverse_world"."ToolStat"("savesTotal" DESC);
CREATE INDEX IF NOT EXISTS "ToolStat_comparesTotal_idx"
  ON "aiverse_world"."ToolStat"("comparesTotal" DESC);

CREATE TABLE IF NOT EXISTS "aiverse_world"."SavedTool" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "toolId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "SavedTool_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "SavedTool_userId_toolId_key"
  ON "aiverse_world"."SavedTool"("userId", "toolId");
CREATE INDEX IF NOT EXISTS "SavedTool_userId_createdAt_idx"
  ON "aiverse_world"."SavedTool"("userId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "SavedTool_toolId_idx"
  ON "aiverse_world"."SavedTool"("toolId");

CREATE TABLE IF NOT EXISTS "aiverse_world"."FollowedCategory" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "FollowedCategory_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "FollowedCategory_userId_category_key"
  ON "aiverse_world"."FollowedCategory"("userId", "category");
CREATE INDEX IF NOT EXISTS "FollowedCategory_userId_idx"
  ON "aiverse_world"."FollowedCategory"("userId");
