CREATE SCHEMA IF NOT EXISTS "aiverse_world";

CREATE TABLE IF NOT EXISTS "aiverse_world"."AiToolSource" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "baseUrl" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "lastSyncedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "AiToolSource_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "aiverse_world"."AiTool" (
  "id" TEXT NOT NULL,
  "sourceId" TEXT,
  "rank" INTEGER,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "subcategory" TEXT NOT NULL,
  "company" TEXT NOT NULL,
  "website" TEXT NOT NULL,
  "domain" TEXT NOT NULL,
  "favicon" TEXT NOT NULL,
  "logoUrl" TEXT,
  "freePlan" TEXT NOT NULL,
  "freeTrial" BOOLEAN NOT NULL DEFAULT false,
  "pricingModel" TEXT NOT NULL,
  "startingPriceUsd" DOUBLE PRECISION,
  "pricingNotes" TEXT,
  "shortDescription" TEXT NOT NULL,
  "summary" TEXT,
  "features" JSONB NOT NULL,
  "bestFor" JSONB NOT NULL,
  "targetAudience" JSONB NOT NULL,
  "tags" JSONB NOT NULL,
  "aiType" JSONB NOT NULL,
  "modalities" JSONB NOT NULL,
  "modelProvider" JSONB NOT NULL,
  "modelNames" JSONB,
  "apiAvailable" BOOLEAN NOT NULL DEFAULT false,
  "openSource" BOOLEAN NOT NULL DEFAULT false,
  "deploymentType" JSONB NOT NULL,
  "platforms" JSONB NOT NULL,
  "integrations" JSONB,
  "teamCollaboration" BOOLEAN,
  "security" JSONB,
  "privacyNotes" TEXT,
  "popularityScore" INTEGER,
  "rating" DOUBLE PRECISION,
  "reviewCount" INTEGER,
  "status" TEXT NOT NULL DEFAULT 'Active',
  "launchYear" INTEGER,
  "lastVerified" TIMESTAMP(3),
  "sourceUrl" TEXT NOT NULL,
  "sourceType" TEXT NOT NULL,
  "searchText" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "AiTool_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "AiToolSource_name_key" ON "aiverse_world"."AiToolSource"("name");
CREATE UNIQUE INDEX IF NOT EXISTS "AiTool_slug_key" ON "aiverse_world"."AiTool"("slug");
CREATE INDEX IF NOT EXISTS "AiTool_category_idx" ON "aiverse_world"."AiTool"("category");
CREATE INDEX IF NOT EXISTS "AiTool_pricingModel_idx" ON "aiverse_world"."AiTool"("pricingModel");
CREATE INDEX IF NOT EXISTS "AiTool_popularityScore_idx" ON "aiverse_world"."AiTool"("popularityScore");
CREATE INDEX IF NOT EXISTS "AiTool_rating_idx" ON "aiverse_world"."AiTool"("rating");
CREATE INDEX IF NOT EXISTS "AiTool_updatedAt_idx" ON "aiverse_world"."AiTool"("updatedAt" DESC);

ALTER TABLE "aiverse_world"."AiTool"
  ADD CONSTRAINT "AiTool_sourceId_fkey"
  FOREIGN KEY ("sourceId") REFERENCES "aiverse_world"."AiToolSource"("id") ON DELETE SET NULL ON UPDATE CASCADE;
