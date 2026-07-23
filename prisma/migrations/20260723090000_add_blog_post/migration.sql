CREATE TABLE IF NOT EXISTS "aiverse_world"."BlogPost" (
  "id" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "tags" JSONB,
  "author" TEXT NOT NULL,
  "coverImage" TEXT,
  "seoTitle" TEXT,
  "metaDescription" TEXT,
  "readTime" TEXT NOT NULL DEFAULT '5 min',
  "themeJson" JSONB,
  "featured" BOOLEAN NOT NULL DEFAULT false,
  "published" BOOLEAN NOT NULL DEFAULT true,
  "publishedAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "BlogPost_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "BlogPost_slug_key" ON "aiverse_world"."BlogPost"("slug");
CREATE INDEX IF NOT EXISTS "BlogPost_published_publishedAt_idx"
  ON "aiverse_world"."BlogPost"("published", "publishedAt" DESC);
CREATE INDEX IF NOT EXISTS "BlogPost_category_idx" ON "aiverse_world"."BlogPost"("category");
CREATE INDEX IF NOT EXISTS "BlogPost_featured_idx" ON "aiverse_world"."BlogPost"("featured");
