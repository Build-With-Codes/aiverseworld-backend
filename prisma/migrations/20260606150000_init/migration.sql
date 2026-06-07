CREATE TABLE "NewsArticle" (
  "id" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "sourceName" TEXT NOT NULL,
  "sourceUrl" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "excerpt" TEXT NOT NULL,
  "summary" TEXT NOT NULL,
  "keyPoints" JSONB NOT NULL,
  "category" TEXT NOT NULL,
  "imageUrl" TEXT NOT NULL,
  "publishedAt" TIMESTAMP(3) NOT NULL,
  "processedAt" TIMESTAMP(3) NOT NULL,
  "copyrightOwner" TEXT NOT NULL,
  "summaryOnly" BOOLEAN NOT NULL DEFAULT true,
  "takedownEmail" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "NewsArticle_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "NewsPipelineRun" (
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

CREATE UNIQUE INDEX "NewsArticle_sourceUrl_key" ON "NewsArticle"("sourceUrl");
CREATE INDEX "NewsArticle_publishedAt_idx" ON "NewsArticle"("publishedAt" DESC);
CREATE INDEX "NewsArticle_category_idx" ON "NewsArticle"("category");
CREATE INDEX "NewsPipelineRun_createdAt_idx" ON "NewsPipelineRun"("createdAt" DESC);
CREATE INDEX "NewsPipelineRun_status_idx" ON "NewsPipelineRun"("status");
