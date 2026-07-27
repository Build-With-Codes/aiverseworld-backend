CREATE TABLE IF NOT EXISTS "aiverse_world"."BookRecommendation" (
  "id" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "subtitle" TEXT,
  "author" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "isbn13" TEXT,
  "coverUrl" TEXT,
  "buyUrl" TEXT NOT NULL,
  "merchant" TEXT NOT NULL DEFAULT 'Direct',
  "categories" JSONB NOT NULL,
  "tags" JSONB NOT NULL,
  "keywords" JSONB NOT NULL,
  "priority" INTEGER NOT NULL DEFAULT 0,
  "affiliateUrl" TEXT,
  "affiliateEnabled" BOOLEAN NOT NULL DEFAULT false,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "BookRecommendation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "BookRecommendation_slug_key"
  ON "aiverse_world"."BookRecommendation"("slug");
CREATE INDEX IF NOT EXISTS "BookRecommendation_isActive_priority_idx"
  ON "aiverse_world"."BookRecommendation"("isActive", "priority");
CREATE INDEX IF NOT EXISTS "BookRecommendation_merchant_idx"
  ON "aiverse_world"."BookRecommendation"("merchant");

CREATE TABLE IF NOT EXISTS "aiverse_world"."PageBook" (
  "id" TEXT NOT NULL,
  "contextType" TEXT NOT NULL,
  "contextKey" TEXT NOT NULL,
  "googleBookId" TEXT NOT NULL,
  "isbn13" TEXT,
  "title" TEXT NOT NULL,
  "subtitle" TEXT,
  "authors" JSONB NOT NULL,
  "description" TEXT,
  "thumbnailUrl" TEXT,
  "averageRating" DOUBLE PRECISION,
  "ratingsCount" INTEGER,
  "previewLink" TEXT,
  "infoLink" TEXT NOT NULL,
  "publishedDate" TEXT,
  "categories" JSONB NOT NULL,
  "score" INTEGER NOT NULL DEFAULT 0,
  "reason" TEXT NOT NULL,
  "searchQueries" JSONB NOT NULL,
  "cachedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "PageBook_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PageBook_contextType_contextKey_googleBookId_key"
  ON "aiverse_world"."PageBook"("contextType", "contextKey", "googleBookId");
CREATE INDEX IF NOT EXISTS "PageBook_contextType_contextKey_cachedAt_idx"
  ON "aiverse_world"."PageBook"("contextType", "contextKey", "cachedAt");
CREATE INDEX IF NOT EXISTS "PageBook_score_idx"
  ON "aiverse_world"."PageBook"("score");
