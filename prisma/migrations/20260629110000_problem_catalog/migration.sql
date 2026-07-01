CREATE SCHEMA IF NOT EXISTS "aiverse_world";

CREATE TABLE IF NOT EXISTS "aiverse_world"."Problem" (
  "id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "industry" TEXT NOT NULL,
  "frequency" TEXT NOT NULL,
  "painScore" INTEGER NOT NULL,
  "email" TEXT,
  "aiSolvable" INTEGER NOT NULL DEFAULT 0,
  "notAiSolvable" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Problem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "Problem_createdAt_idx" ON "aiverse_world"."Problem"("createdAt" DESC);
CREATE INDEX IF NOT EXISTS "Problem_industry_idx" ON "aiverse_world"."Problem"("industry");
CREATE INDEX IF NOT EXISTS "Problem_painScore_idx" ON "aiverse_world"."Problem"("painScore");
