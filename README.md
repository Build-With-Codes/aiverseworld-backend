<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="120" alt="Nest Logo" /></a>
</p>

[circleci-image]: https://img.shields.io/circleci/build/github/nestjs/nest/master?token=abc123def456
[circleci-url]: https://circleci.com/gh/nestjs/nest

  <p align="center">A progressive <a href="http://nodejs.org" target="_blank">Node.js</a> framework for building efficient and scalable server-side applications.</p>
    <p align="center">
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/v/@nestjs/core.svg" alt="NPM Version" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/l/@nestjs/core.svg" alt="Package License" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/dm/@nestjs/common.svg" alt="NPM Downloads" /></a>
<a href="https://circleci.com/gh/nestjs/nest" target="_blank"><img src="https://img.shields.io/circleci/build/github/nestjs/nest/master" alt="CircleCI" /></a>
<a href="https://discord.gg/G7Qnnhy" target="_blank"><img src="https://img.shields.io/badge/discord-online-brightgreen.svg" alt="Discord"/></a>
<a href="https://opencollective.com/nest#backer" target="_blank"><img src="https://opencollective.com/nest/backers/badge.svg" alt="Backers on Open Collective" /></a>
<a href="https://opencollective.com/nest#sponsor" target="_blank"><img src="https://opencollective.com/nest/sponsors/badge.svg" alt="Sponsors on Open Collective" /></a>
  <a href="https://paypal.me/kamilmysliwiec" target="_blank"><img src="https://img.shields.io/badge/Donate-PayPal-ff3f59.svg" alt="Donate us"/></a>
    <a href="https://opencollective.com/nest#sponsor"  target="_blank"><img src="https://img.shields.io/badge/Support%20us-Open%20Collective-41B883.svg" alt="Support us"></a>
  <a href="https://twitter.com/nestframework" target="_blank"><img src="https://img.shields.io/twitter/follow/nestframework.svg?style=social&label=Follow" alt="Follow us on Twitter"></a>
</p>
  <!--[![Backers on Open Collective](https://opencollective.com/nest/backers/badge.svg)](https://opencollective.com/nest#backer)
  [![Sponsors on Open Collective](https://opencollective.com/nest/sponsors/badge.svg)](https://opencollective.com/nest#sponsor)-->

## Description

[Nest](https://github.com/nestjs/nest) framework TypeScript starter repository.

## Project setup

```bash
$ npm install
```

## AiverseWorld configuration

The AI tool catalog is stored in Postgres, while AI Finder RAG vectors are stored in Pinecone.

Required database variables:

```bash
DATABASE_URL="postgresql://..."
DIRECT_URL="postgresql://..."
```

Required Pinecone variables for AI Finder RAG and tool vector imports:

```bash
PINECONE_API_KEY="..."
PINECONE_INDEX_NAME="aiverseworld-ai-tools"
PINECONE_NAMESPACE="ai-tools"
AI_TOOL_EMBEDDING_DIMENSION="1024"
```

Set `PINECONE_INDEX_HOST` only when you want to target a specific Pinecone host directly.

Cloudflare Workers AI is used for BGE-M3 embeddings and BGE reranking when configured:

```bash
CLOUDFLARE_ACCOUNT_ID="..."
CLOUDFLARE_API_TOKEN="..."
CLOUDFLARE_EMBEDDING_MODEL="@cf/baai/bge-m3"
CLOUDFLARE_RERANKER_MODEL="@cf/baai/bge-reranker-base"
```

Aliases accepted by the backend:

- Account ID: `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_ACCOUNTID`, `CF_ACCOUNT_ID`, `CF_ACCOUNTID`
- API token/key: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_AUTH_TOKEN`, `CLOUDFLARE_AI_API_TOKEN`, `CLOUDFLARE_API_KEY`, `CF_API_TOKEN`, `CF_API_KEY`

If Cloudflare credentials are not present or a Cloudflare request fails, AI Finder falls back to `local-hash-embedding-v1` and local ranking. Create or target a Pinecone index with dimension `1024` and metric `cosine`.

For OpenRouter AI Finder explanations, set `OPENROUTER_MODEL=openrouter/free` to let the backend fetch available free OpenRouter models and send them with fallback routing.

AI Finder search requests do not refresh Pinecone by default. Admin tool creates/updates index the affected tool, and `npm run tools:reindex` handles full refreshes. For debugging only, set `AI_FINDER_ENSURE_INDEX_ON_QUERY=true` to restore blocking index freshness checks before every recommendation request.

Langfuse tracing is enabled when these variables are present:

```bash
LANGFUSE_PUBLIC_KEY="..."
LANGFUSE_SECRET_KEY="..."
LANGFUSE_BASE_URL="https://cloud.langfuse.com"
```

AI Finder traces include request/session IDs, LangGraph node spans, query rewriting, metadata filters, Pinecone semantic retrieval, PostgreSQL keyword retrieval, retrieved chunks, RRF merge, reranking/business ranking, OpenRouter prompts/responses, token usage when returned by the provider, latency, final response, and grounding/faithfulness scores.

Public catalog APIs are cached in Upstash Redis for two days by default. Configure:

```bash
UPSTASH_REDIS_REST_URL="https://..."
UPSTASH_REDIS_REST_TOKEN="..."
API_CACHE_TTL_SECONDS="172800"
```

The cache applies to public `GET` requests under `/api/tools`, `/api/problems`, and `/api/news`, except health/reindex endpoints. Admin tool writes, problem writes/votes, and news refresh/ingest requests bump the cache version so new reads do not use stale entries.

Catalog import and vector reindex commands:

```bash
npm run tools:import
npm run tools:reindex
```

Run `npm run tools:reindex` after changing embedding metadata/text structure so existing Pinecone records receive the latest fields such as `company`, `subcategory`, `freeTrial`, `platforms`, `status`, and `rating`.

## Compile and run the project

```bash
# development
$ npm run start:nest

# watch mode
$ npm run start:dev

# production mode
$ npm run build
$ npm run start:prod
```

## Render deployment

Use these commands on Render:

```bash
Build Command: npm install && npm run build
Start Command: npm start
```

`npm start` attempts Prisma migrations and then starts the compiled `dist/main.js` file. Migrations intentionally use only `DIRECT_URL`/`DIRECT_DATABASE_URL`; runtime `DATABASE_URL` is for the app pool. On Supabase, set `DIRECT_URL` to a reachable direct or session-pooler connection, not the transaction pooler. If that migration database is unreachable during Render startup, the deploy fails so the app does not run with missing tables. For a temporary emergency boot, set `ALLOW_UNREACHABLE_MIGRATIONS=true`, but required tables must still be created by fixing `DIRECT_URL` or running `npm run prisma:migrate` from a network that can reach Postgres. Do not use `nest start` as the Render start command because it loads the Nest CLI/compiler in production and can exceed the small instance heap limit.

Startup only creates or migrates schema. It does not import default/sample AI tools or problems. Add data manually through the admin API, or run explicit import commands such as `npm run tools:import` and `npm run problems:import` when you actually want to seed data.

## Admin AI tool API

Set `ADMIN_API_KEY` in production. Admin writes accept either `x-admin-api-key: <key>` or `Authorization: Bearer <key>`.

```bash
POST /api/admin/tools
POST /api/admin/tools/bulk
PUT /api/admin/tools/:id
POST /api/admin/tools/:id/reindex
```

`POST /api/admin/tools` upserts by `slug` and then refreshes that tool in Pinecone. Required JSON fields are `name`, `category`, and `shortDescription`; optional fields match the AI tool catalog fields such as `features`, `bestFor`, `targetAudience`, `pricingModel`, `website`, `tags`, `platforms`, and `modelProvider`.

## Run tests

```bash
# unit tests
$ npm run test

# e2e tests
$ npm run test:e2e

# test coverage
$ npm run test:cov
```

## Deployment

When you're ready to deploy your NestJS application to production, there are some key steps you can take to ensure it runs as efficiently as possible. Check out the [deployment documentation](https://docs.nestjs.com/deployment) for more information.

If you are looking for a cloud-based platform to deploy your NestJS application, check out [Mau](https://mau.nestjs.com), our official platform for deploying NestJS applications on AWS. Mau makes deployment straightforward and fast, requiring just a few simple steps:

```bash
$ npm install -g @nestjs/mau
$ mau deploy
```

With Mau, you can deploy your application in just a few clicks, allowing you to focus on building features rather than managing infrastructure.

## Resources

Check out a few resources that may come in handy when working with NestJS:

- Visit the [NestJS Documentation](https://docs.nestjs.com) to learn more about the framework.
- For questions and support, please visit our [Discord channel](https://discord.gg/G7Qnnhy).
- To dive deeper and get more hands-on experience, check out our official video [courses](https://courses.nestjs.com/).
- Deploy your application to AWS with the help of [NestJS Mau](https://mau.nestjs.com) in just a few clicks.
- Visualize your application graph and interact with the NestJS application in real-time using [NestJS Devtools](https://devtools.nestjs.com).
- Need help with your project (part-time to full-time)? Check out our official [enterprise support](https://enterprise.nestjs.com).
- To stay in the loop and get updates, follow us on [X](https://x.com/nestframework) and [LinkedIn](https://linkedin.com/company/nestjs).
- Looking for a job, or have a job to offer? Check out our official [Jobs board](https://jobs.nestjs.com).

## Support

Nest is an MIT-licensed open source project. It can grow thanks to the sponsors and support by the amazing backers. If you'd like to join them, please [read more here](https://docs.nestjs.com/support).

## Stay in touch

- Author - [Kamil Myśliwiec](https://twitter.com/kammysliwiec)
- Website - [https://nestjs.com](https://nestjs.com/)
- Twitter - [@nestframework](https://twitter.com/nestframework)

## License

Nest is [MIT licensed](https://github.com/nestjs/nest/blob/master/LICENSE).
