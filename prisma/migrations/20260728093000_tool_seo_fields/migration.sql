ALTER TABLE "aiverse_world"."AiTool"
  ADD COLUMN "seoTitle" TEXT,
  ADD COLUMN "seoDescription" TEXT,
  ADD COLUMN "seoKeywords" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "canonicalUrl" TEXT,
  ADD COLUMN "ogImage" TEXT;
