CREATE TABLE IF NOT EXISTS "aiverse_world"."ToolYoutubeVideo" (
  "id" TEXT NOT NULL,
  "toolId" TEXT NOT NULL,
  "toolSlug" TEXT NOT NULL,
  "videoId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "channelTitle" TEXT,
  "description" TEXT,
  "thumbnailUrl" TEXT,
  "publishedAt" TIMESTAMP(3),
  "url" TEXT NOT NULL,
  "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ToolYoutubeVideo_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ToolYoutubeVideo_toolId_fkey" FOREIGN KEY ("toolId") REFERENCES "aiverse_world"."AiTool"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "ToolYoutubeVideo_toolSlug_videoId_key"
  ON "aiverse_world"."ToolYoutubeVideo"("toolSlug", "videoId");
CREATE INDEX IF NOT EXISTS "ToolYoutubeVideo_toolSlug_idx"
  ON "aiverse_world"."ToolYoutubeVideo"("toolSlug");
CREATE INDEX IF NOT EXISTS "ToolYoutubeVideo_toolId_idx"
  ON "aiverse_world"."ToolYoutubeVideo"("toolId");
CREATE INDEX IF NOT EXISTS "ToolYoutubeVideo_fetchedAt_idx"
  ON "aiverse_world"."ToolYoutubeVideo"("fetchedAt");
