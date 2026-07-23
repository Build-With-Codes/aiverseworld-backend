CREATE TABLE IF NOT EXISTS "aiverse_world"."Media" (
  "id" TEXT NOT NULL,
  "filename" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "storageKey" TEXT,
  "mimeType" TEXT NOT NULL,
  "format" TEXT NOT NULL,
  "width" INTEGER,
  "height" INTEGER,
  "size" INTEGER,
  "altText" TEXT,
  "caption" TEXT,
  "credit" TEXT,
  "license" TEXT,
  "blurDataUrl" TEXT,
  "sourceUrl" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Media_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "Media_createdAt_idx" ON "aiverse_world"."Media"("createdAt" DESC);

ALTER TABLE "aiverse_world"."BlogPost"
  ADD COLUMN IF NOT EXISTS "contentBlocks" JSONB,
  ADD COLUMN IF NOT EXISTS "coverMediaId" TEXT,
  ADD COLUMN IF NOT EXISTS "galleryJson" JSONB;

CREATE INDEX IF NOT EXISTS "BlogPost_coverMediaId_idx" ON "aiverse_world"."BlogPost"("coverMediaId");

ALTER TABLE "aiverse_world"."BlogPost"
  ADD CONSTRAINT "BlogPost_coverMediaId_fkey"
  FOREIGN KEY ("coverMediaId") REFERENCES "aiverse_world"."Media"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
