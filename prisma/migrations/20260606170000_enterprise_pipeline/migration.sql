CREATE SCHEMA IF NOT EXISTS "aiverse_world";

CREATE TABLE IF NOT EXISTS "aiverse_world"."NewsSource" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "baseUrl" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "pollIntervalMinutes" INTEGER NOT NULL DEFAULT 15,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "NewsSource_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "aiverse_world"."RawArticle" (
  "id" TEXT NOT NULL,
  "sourceId" TEXT NOT NULL,
  "externalId" TEXT,
  "title" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "excerpt" TEXT NOT NULL,
  "author" TEXT,
  "publishedAt" TIMESTAMP(3) NOT NULL,
  "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "contentHash" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'fetched',
  "category" TEXT,
  "imageUrl" TEXT,
  "isDuplicate" BOOLEAN NOT NULL DEFAULT false,
  "duplicateOfId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "RawArticle_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "aiverse_world"."AiArticle" (
  "id" TEXT NOT NULL,
  "rawArticleId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "summary" TEXT NOT NULL,
  "keyPoints" JSONB NOT NULL,
  "category" TEXT NOT NULL,
  "tags" JSONB,
  "sourceUrl" TEXT NOT NULL,
  "sourceName" TEXT NOT NULL,
  "imageUrl" TEXT NOT NULL,
  "publishedAt" TIMESTAMP(3) NOT NULL,
  "processedAt" TIMESTAMP(3) NOT NULL,
  "isPublished" BOOLEAN NOT NULL DEFAULT true,
  "copyrightOwner" TEXT NOT NULL,
  "summaryOnly" BOOLEAN NOT NULL DEFAULT true,
  "takedownEmail" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "AiArticle_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "NewsSource_name_key" ON "aiverse_world"."NewsSource"("name");
CREATE UNIQUE INDEX IF NOT EXISTS "RawArticle_url_key" ON "aiverse_world"."RawArticle"("url");
CREATE UNIQUE INDEX IF NOT EXISTS "AiArticle_rawArticleId_key" ON "aiverse_world"."AiArticle"("rawArticleId");
CREATE UNIQUE INDEX IF NOT EXISTS "AiArticle_sourceUrl_key" ON "aiverse_world"."AiArticle"("sourceUrl");
CREATE INDEX IF NOT EXISTS "RawArticle_sourceId_publishedAt_idx" ON "aiverse_world"."RawArticle"("sourceId", "publishedAt" DESC);
CREATE INDEX IF NOT EXISTS "RawArticle_contentHash_idx" ON "aiverse_world"."RawArticle"("contentHash");
CREATE INDEX IF NOT EXISTS "RawArticle_status_idx" ON "aiverse_world"."RawArticle"("status");
CREATE INDEX IF NOT EXISTS "AiArticle_publishedAt_idx" ON "aiverse_world"."AiArticle"("publishedAt" DESC);
CREATE INDEX IF NOT EXISTS "AiArticle_category_idx" ON "aiverse_world"."AiArticle"("category");
CREATE INDEX IF NOT EXISTS "AiArticle_isPublished_idx" ON "aiverse_world"."AiArticle"("isPublished");

ALTER TABLE "aiverse_world"."RawArticle"
  ADD CONSTRAINT "RawArticle_sourceId_fkey"
  FOREIGN KEY ("sourceId") REFERENCES "aiverse_world"."NewsSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "aiverse_world"."AiArticle"
  ADD CONSTRAINT "AiArticle_rawArticleId_fkey"
  FOREIGN KEY ("rawArticleId") REFERENCES "aiverse_world"."RawArticle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
