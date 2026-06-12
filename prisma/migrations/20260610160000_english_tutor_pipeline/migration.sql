CREATE SCHEMA IF NOT EXISTS "aiverse_world";

CREATE TABLE IF NOT EXISTS "aiverse_world"."EnglishTutorSession" (
  "id" TEXT NOT NULL,
  "userId" TEXT,
  "realtimeId" TEXT,
  "focus" TEXT NOT NULL DEFAULT 'Daily conversation',
  "provider" TEXT NOT NULL DEFAULT 'openai-realtime',
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "endedAt" TIMESTAMP(3),
  "averageScore" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EnglishTutorSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "aiverse_world"."EnglishTutorTurn" (
  "id" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "userId" TEXT,
  "userText" TEXT NOT NULL,
  "tutorText" TEXT NOT NULL,
  "correction" TEXT,
  "score" INTEGER NOT NULL,
  "focus" TEXT NOT NULL,
  "provider" TEXT NOT NULL DEFAULT 'openai-realtime',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EnglishTutorTurn_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "aiverse_world"."EnglishTutorMistake" (
  "id" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "turnId" TEXT,
  "userId" TEXT,
  "mistake" TEXT NOT NULL,
  "correction" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "count" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EnglishTutorMistake_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "EnglishTutorSession_userId_startedAt_idx" ON "aiverse_world"."EnglishTutorSession"("userId", "startedAt" DESC);
CREATE INDEX IF NOT EXISTS "EnglishTutorSession_startedAt_idx" ON "aiverse_world"."EnglishTutorSession"("startedAt" DESC);
CREATE INDEX IF NOT EXISTS "EnglishTutorTurn_sessionId_createdAt_idx" ON "aiverse_world"."EnglishTutorTurn"("sessionId", "createdAt");
CREATE INDEX IF NOT EXISTS "EnglishTutorTurn_userId_createdAt_idx" ON "aiverse_world"."EnglishTutorTurn"("userId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "EnglishTutorMistake_userId_category_idx" ON "aiverse_world"."EnglishTutorMistake"("userId", "category");
CREATE INDEX IF NOT EXISTS "EnglishTutorMistake_sessionId_idx" ON "aiverse_world"."EnglishTutorMistake"("sessionId");
CREATE INDEX IF NOT EXISTS "EnglishTutorMistake_mistake_idx" ON "aiverse_world"."EnglishTutorMistake"("mistake");

ALTER TABLE "aiverse_world"."EnglishTutorTurn"
  ADD CONSTRAINT "EnglishTutorTurn_sessionId_fkey"
  FOREIGN KEY ("sessionId") REFERENCES "aiverse_world"."EnglishTutorSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "aiverse_world"."EnglishTutorMistake"
  ADD CONSTRAINT "EnglishTutorMistake_sessionId_fkey"
  FOREIGN KEY ("sessionId") REFERENCES "aiverse_world"."EnglishTutorSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "aiverse_world"."EnglishTutorMistake"
  ADD CONSTRAINT "EnglishTutorMistake_turnId_fkey"
  FOREIGN KEY ("turnId") REFERENCES "aiverse_world"."EnglishTutorTurn"("id") ON DELETE SET NULL ON UPDATE CASCADE;
