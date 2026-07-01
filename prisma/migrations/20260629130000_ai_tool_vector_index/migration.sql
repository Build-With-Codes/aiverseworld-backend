CREATE TABLE IF NOT EXISTS "aiverse_world"."AiToolEmbedding" (
  "id" TEXT NOT NULL,
  "toolId" TEXT NOT NULL,
  "chunkIndex" INTEGER NOT NULL,
  "content" TEXT NOT NULL,
  "contentHash" TEXT NOT NULL,
  "embedding" JSONB NOT NULL,
  "embeddingModel" TEXT NOT NULL,
  "metadata" JSONB,
  "sourceUpdatedAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "AiToolEmbedding_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "AiToolEmbedding_toolId_chunkIndex_key"
  ON "aiverse_world"."AiToolEmbedding"("toolId", "chunkIndex");
CREATE INDEX IF NOT EXISTS "AiToolEmbedding_toolId_idx"
  ON "aiverse_world"."AiToolEmbedding"("toolId");
CREATE INDEX IF NOT EXISTS "AiToolEmbedding_contentHash_idx"
  ON "aiverse_world"."AiToolEmbedding"("contentHash");
CREATE INDEX IF NOT EXISTS "AiToolEmbedding_updatedAt_idx"
  ON "aiverse_world"."AiToolEmbedding"("updatedAt" DESC);

ALTER TABLE "aiverse_world"."AiToolEmbedding"
  ADD CONSTRAINT "AiToolEmbedding_toolId_fkey"
  FOREIGN KEY ("toolId") REFERENCES "aiverse_world"."AiTool"("id") ON DELETE CASCADE ON UPDATE CASCADE;
