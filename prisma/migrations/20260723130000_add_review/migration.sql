CREATE TABLE IF NOT EXISTS "aiverse_world"."Review" (
  "id" TEXT NOT NULL,
  "toolId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "authorName" TEXT NOT NULL,
  "authorEmail" TEXT NOT NULL,
  "authorImage" TEXT,
  "rating" INTEGER NOT NULL,
  "comment" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Review_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Review_userId_toolId_key" ON "aiverse_world"."Review"("userId", "toolId");
CREATE INDEX IF NOT EXISTS "Review_toolId_createdAt_idx" ON "aiverse_world"."Review"("toolId", "createdAt" DESC);
