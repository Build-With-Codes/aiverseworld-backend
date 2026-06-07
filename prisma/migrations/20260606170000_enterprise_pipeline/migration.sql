CREATE TABLE "NewsSource" (
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

CREATE TABLE "RawArticle" (
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

CREATE TABLE "AiArticle" (
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

CREATE UNIQUE INDEX "NewsSource_name_key" ON "NewsSource"("name");
CREATE UNIQUE INDEX "RawArticle_url_key" ON "RawArticle"("url");
CREATE UNIQUE INDEX "AiArticle_rawArticleId_key" ON "AiArticle"("rawArticleId");
CREATE UNIQUE INDEX "AiArticle_sourceUrl_key" ON "AiArticle"("sourceUrl");
CREATE INDEX "RawArticle_sourceId_publishedAt_idx" ON "RawArticle"("sourceId", "publishedAt" DESC);
CREATE INDEX "RawArticle_contentHash_idx" ON "RawArticle"("contentHash");
CREATE INDEX "RawArticle_status_idx" ON "RawArticle"("status");
CREATE INDEX "AiArticle_publishedAt_idx" ON "AiArticle"("publishedAt" DESC);
CREATE INDEX "AiArticle_category_idx" ON "AiArticle"("category");
CREATE INDEX "AiArticle_isPublished_idx" ON "AiArticle"("isPublished");

ALTER TABLE "RawArticle"
ADD CONSTRAINT "RawArticle_sourceId_fkey"
FOREIGN KEY ("sourceId") REFERENCES "NewsSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AiArticle"
ADD CONSTRAINT "AiArticle_rawArticleId_fkey"
FOREIGN KEY ("rawArticleId") REFERENCES "RawArticle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
