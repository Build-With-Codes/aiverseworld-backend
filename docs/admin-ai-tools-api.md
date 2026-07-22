# Admin AI Tools API

This document explains how to insert and update AI tool records from an admin UI or importer. All public tool pages read from Postgres through the normal `/api/tools` APIs. Admin writes also refresh Pinecone so AI Finder/RAG recommendations stay synced.

## Base URLs

Local:

```bash
http://localhost:3001
```

Production:

```bash
https://aiverseworld-backend.onrender.com
```

## Authentication

Set this environment variable in production:

```bash
ADMIN_API_KEY=your-secret-admin-key
```

Send the key using either header:

```bash
x-admin-api-key: your-secret-admin-key
```

or:

```bash
Authorization: Bearer your-secret-admin-key
```

Production admin writes fail if `ADMIN_API_KEY` is missing.

## Data Flow

When an admin inserts or updates a tool:

1. The backend writes the tool to Postgres in `AiTool`.
2. The backend creates or updates the source in `AiToolSource`.
3. The backend deletes old vector chunks for that tool from Pinecone.
4. The backend creates fresh embeddings.
5. The backend upserts fresh Pinecone records.
6. The backend stores chunk metadata in `AiToolEmbedding`.

After this, existing public APIs, search, category pages, compare pages, and AI Finder use the latest data.

## Insert Or Update Tool

Endpoint:

```bash
POST /api/admin/tools
```

Behavior:

- Upserts by `slug`.
- If `slug` exists, the existing tool is updated.
- If `slug` does not exist, a new tool is created.
- If `slug` is not sent, the backend generates one from `name`.
- Pinecone is refreshed for the saved tool.

Required fields:

```json
{
  "name": "VideoCraft AI",
  "category": "Video Generation",
  "shortDescription": "Generate short marketing videos from text prompts."
}
```

Full sample request:

```bash
curl -X POST "https://aiverseworld-backend.onrender.com/api/admin/tools" \
  -H "Content-Type: application/json" \
  -H "x-admin-api-key: YOUR_ADMIN_API_KEY" \
  -d '{
    "name": "VideoCraft AI",
    "slug": "videocraft-ai",
    "category": "Video Generation",
    "subcategory": "Text to Video",
    "company": "VideoCraft",
    "website": "https://videocraft.example.com",
    "shortDescription": "Generate short marketing videos from text prompts.",
    "summary": [
      "VideoCraft AI helps creators and teams generate social-ready videos from prompts, scripts, and brand assets.",
      "It is useful for marketing videos, product explainers, and short social media clips."
    ],
    "features": ["Text to video", "Script to video", "Brand templates", "Voiceover"],
    "bestFor": ["Marketing videos", "Social media clips", "Product explainers"],
    "targetAudience": ["Creators", "Marketers", "Small businesses"],
    "tags": ["video", "text-to-video", "marketing", "creator"],
    "aiType": ["Generative AI"],
    "modalities": ["Text", "Video", "Audio"],
    "modelProvider": ["Proprietary"],
    "modelNames": ["VideoCraft 1.0"],
    "freePlan": "Yes",
    "freeTrial": true,
    "pricingModel": "Freemium",
    "startingPriceUsd": 19,
    "pricingNotes": "Free plan includes limited exports.",
    "apiAvailable": false,
    "openSource": false,
    "deploymentType": ["Cloud"],
    "platforms": ["Web"],
    "integrations": ["Canva", "YouTube", "TikTok"],
    "teamCollaboration": true,
    "security": ["SOC 2 planned"],
    "privacyNotes": "User videos are private by default.",
    "popularityScore": 72,
    "rating": 4.5,
    "reviewCount": 120,
    "status": "Active",
    "launchYear": 2026,
    "lastVerified": "2026-07-02",
    "sourceUrl": "https://videocraft.example.com",
    "sourceType": "admin-api"
  }'
```

Sample response:

```json
{
  "data": {
    "id": "cmxyz123",
    "rank": 0,
    "name": "VideoCraft AI",
    "slug": "videocraft-ai",
    "category": "Video Generation",
    "subcategory": "Text to Video",
    "company": "VideoCraft",
    "website": "https://videocraft.example.com",
    "freePlan": "Yes",
    "freeTrial": true,
    "pricingModel": "Freemium",
    "shortDescription": "Generate short marketing videos from text prompts.",
    "features": ["Text to video", "Script to video", "Brand templates", "Voiceover"],
    "status": "Active",
    "lastVerified": "2026-07-02",
    "sourceUrl": "https://videocraft.example.com",
    "sourceType": "admin-api"
  },
  "vectorIndex": {
    "toolId": "cmxyz123",
    "chunks": 2
  }
}
```

## Bulk Insert Or Update Tools

Endpoint:

```bash
POST /api/admin/tools/bulk
```

Behavior:

- Accepts up to 100 tools per request.
- Upserts each tool by `slug`.
- Reindexes each saved tool in Pinecone.
- Returns per-row results, so one bad row does not stop the whole batch.
- Body can be either a raw array or an object with a `tools` array.

Sample request:

```bash
curl -X POST "https://aiverseworld-backend.onrender.com/api/admin/tools/bulk" \
  -H "Content-Type: application/json" \
  -H "x-admin-api-key: YOUR_ADMIN_API_KEY" \
  -d '{
    "tools": [
      {
        "name": "VideoCraft AI",
        "slug": "videocraft-ai",
        "category": "Video Generation",
        "subcategory": "Text to Video",
        "website": "https://videocraft.example.com",
        "shortDescription": "Generate short marketing videos from text prompts.",
        "features": ["Text to video", "Brand templates"],
        "bestFor": ["Marketing videos", "Social media clips"],
        "targetAudience": ["Creators", "Marketers"],
        "tags": ["video", "marketing"],
        "modalities": ["Text", "Video"],
        "modelProvider": ["Proprietary"],
        "freePlan": "Yes",
        "pricingModel": "Freemium",
        "deploymentType": ["Cloud"],
        "platforms": ["Web"],
        "sourceUrl": "https://videocraft.example.com",
        "sourceType": "admin-api"
      },
      {
        "name": "WriterFlow AI",
        "slug": "writerflow-ai",
        "category": "Writing Assistant",
        "subcategory": "Copywriting",
        "website": "https://writerflow.example.com",
        "shortDescription": "Create and edit marketing copy with AI.",
        "features": ["Blog outlines", "Ad copy", "Grammar rewrite"],
        "bestFor": ["Content marketing", "SEO briefs"],
        "targetAudience": ["Writers", "Marketers"],
        "tags": ["writing", "copywriting", "seo"],
        "modalities": ["Text"],
        "modelProvider": ["Proprietary"],
        "freePlan": "No",
        "pricingModel": "Subscription",
        "deploymentType": ["Cloud"],
        "platforms": ["Web"],
        "sourceUrl": "https://writerflow.example.com",
        "sourceType": "admin-api"
      }
    ]
  }'
```

Sample response:

```json
{
  "total": 2,
  "succeeded": 2,
  "failed": 0,
  "results": [
    {
      "index": 0,
      "ok": true,
      "data": {
        "id": "cmxyz123",
        "name": "VideoCraft AI",
        "slug": "videocraft-ai"
      },
      "vectorIndex": {
        "toolId": "cmxyz123",
        "chunks": 2
      }
    },
    {
      "index": 1,
      "ok": true,
      "data": {
        "id": "cmxyz456",
        "name": "WriterFlow AI",
        "slug": "writerflow-ai"
      },
      "vectorIndex": {
        "toolId": "cmxyz456",
        "chunks": 2
      }
    }
  ]
}
```

## Update Tool By ID

Endpoint:

```bash
PUT /api/admin/tools/:id
```

Use this when the admin UI already has the tool ID. Any sent fields replace the current values. Pinecone is refreshed after the update.

Sample request:

```bash
curl -X PUT "https://aiverseworld-backend.onrender.com/api/admin/tools/cmxyz123" \
  -H "Content-Type: application/json" \
  -H "x-admin-api-key: YOUR_ADMIN_API_KEY" \
  -d '{
    "pricingModel": "Subscription",
    "startingPriceUsd": 29,
    "features": ["Text to video", "Brand templates", "4K export"],
    "summary": [
      "Updated summary paragraph one for the tool.",
      "Updated summary paragraph two with more detail for the review page."
    ],
  }'
```

Sample response:

```json
{
  "data": {
    "id": "cmxyz123",
    "name": "VideoCraft AI",
    "slug": "videocraft-ai",
    "pricingModel": "Subscription",
    "startingPriceUsd": 29,
    "features": ["Text to video", "Brand templates", "4K export"]
  },
  "vectorIndex": {
    "toolId": "cmxyz123",
    "chunks": 2
  }
}
```

## Reindex One Tool

Endpoint:

```bash
POST /api/admin/tools/:id/reindex
```

Use this when tool data was changed manually in the database and Pinecone needs to be refreshed.

Sample request:

```bash
curl -X POST "https://aiverseworld-backend.onrender.com/api/admin/tools/cmxyz123/reindex" \
  -H "x-admin-api-key: YOUR_ADMIN_API_KEY"
```

Sample response:

```json
{
  "toolId": "cmxyz123",
  "chunks": 2
}
```

## Field Reference

Common fields:

```json
{
  "name": "Tool name",
  "slug": "tool-slug",
  "category": "Video Generation",
  "subcategory": "Text to Video",
  "company": "Company name",
  "website": "https://example.com",
  "shortDescription": "Short page/list description.",
  "summary": "Longer detail page summary. You can also send an array of summary paragraphs.",
  "features": ["Feature 1", "Feature 2"],
  "bestFor": ["Use case 1", "Use case 2"],
  "targetAudience": ["Creators", "Businesses"],
  "tags": ["video", "marketing"],
  "aiType": ["Generative AI"],
  "modalities": ["Text", "Video"],
  "modelProvider": ["OpenAI", "Proprietary"],
  "modelNames": ["Model name"],
  "freePlan": "Yes",
  "freeTrial": true,
  "pricingModel": "Freemium",
  "startingPriceUsd": 19,
  "apiAvailable": false,
  "openSource": false,
  "deploymentType": ["Cloud"],
  "platforms": ["Web"],
  "integrations": ["Slack", "Zapier"],
  "status": "Active",
  "launchYear": 2026,
  "lastVerified": "2026-07-02",
  "sourceUrl": "https://example.com",
  "sourceType": "admin-api"
}
```

Notes:

- `name`, `category`, and `shortDescription` are required for insert/upsert.
- `summary` accepts either a string or an array of paragraph strings. Arrays are saved as paragraph text separated by blank lines.
- Array fields should be sent as JSON arrays of strings.
- `lastVerified` should be `YYYY-MM-DD`.
- `status` defaults to `Active`.
- `freeTrial`, `apiAvailable`, and `openSource` default to `false`.
- `pricingModel` and `freePlan` default to `Unknown`.
- If `domain` is missing, the backend derives it from `website`.
- If `favicon` is missing, the backend generates a Google favicon URL from `domain`.

## Public Read APIs

List tools:

```bash
GET /api/tools?page=1&limit=24
```

Search tools:

```bash
GET /api/tools?q=video%20generator&page=1&limit=24
```

Tool by ID:

```bash
GET /api/tools/id/:id
```

Tool by slug:

```bash
GET /api/tools/slug/:slug
```

Compare two tools:

```bash
GET /api/tools/compare?leftId=:leftId&rightId=:rightId
```

AI Finder RAG recommendation:

```bash
GET /api/tools/recommend/rag?q=i%20need%20a%20video%20generator&limit=4
```

## Required Production Environment

```bash
ADMIN_API_KEY=your-secret-admin-key
DATABASE_URL=postgres-runtime-pool-url
DIRECT_URL=postgres-migration-direct-or-session-pooler-url
PINECONE_API_KEY=your-pinecone-key
PINECONE_INDEX_NAME=aiverseworld-ai-tools
PINECONE_NAMESPACE=ai-tools
PINECONE_INDEX_HOST=your-pinecone-index-host
```

## Troubleshooting

If admin writes fail with missing tables, run migrations first:

```bash
npm run prisma:migrate
```

If Pinecone indexing fails, check:

```bash
PINECONE_API_KEY
PINECONE_INDEX_NAME
PINECONE_NAMESPACE
PINECONE_INDEX_HOST
```

If production admin calls return unauthorized, check:

```bash
ADMIN_API_KEY
```
