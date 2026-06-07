import type { NewsSourceArticle } from './news.types';

export const seedArticles: NewsSourceArticle[] = [
  {
    id: 'openai-enterprise-governance',
    sourceName: 'AI Policy Daily',
    sourceType: 'BLOG',
    sourceBaseUrl: 'https://example.com',
    sourceUrl: 'https://example.com/ai-policy-daily/openai-enterprise-governance',
    title: 'Enterprise AI teams push for tighter governance around agent rollouts',
    excerpt:
      'Large organizations are moving from AI experiments to governed operating models with approval workflows, audit trails, and vendor reviews.',
    body:
      'Enterprise teams are tightening governance as AI agents move into real workflows. Legal, security, and procurement leaders are asking for approval chains, dataset provenance, logging, and model-risk reviews before wider rollout. The shift is forcing product teams to document vendor dependencies, source attribution, and human oversight before agents can touch customer-facing systems.',
    category: 'Governance',
    imageUrl: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?auto=format&fit=crop&w=1200&q=80',
    publishedAt: '2026-06-05T08:30:00.000Z',
  },
  {
    id: 'openrouter-enterprise-spend',
    sourceName: 'Infra Signal',
    sourceType: 'BLOG',
    sourceBaseUrl: 'https://example.com',
    sourceUrl: 'https://example.com/infra-signal/openrouter-enterprise-spend',
    title: 'Model routing gains traction as finance teams scrutinize AI inference spend',
    excerpt:
      'Enterprises are using router layers to balance performance, latency, and cost across multiple models instead of standardizing on a single provider.',
    body:
      'Infrastructure leaders are adopting model routers to dynamically choose providers based on task type, latency budgets, and regional policy constraints. Finance teams increasingly want explainable routing policies because AI usage is now hitting operational budgets in the same way cloud compute once did. Teams also want clean fallback behavior when premium models are unavailable or exceed budget thresholds.',
    category: 'Infrastructure',
    imageUrl: 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=1200&q=80',
    publishedAt: '2026-06-05T11:15:00.000Z',
  },
  {
    id: 'copyright-ai-summaries',
    sourceName: 'Digital Rights Brief',
    sourceType: 'BLOG',
    sourceBaseUrl: 'https://example.com',
    sourceUrl: 'https://example.com/digital-rights-brief/copyright-ai-summaries',
    title: 'Publishers focus on attribution, excerpts, and licensing in AI news products',
    excerpt:
      'Legal teams are drawing a clearer line between summary products that link out and products that republish expressive content too aggressively.',
    body:
      'Publishers are signaling that AI news products need a stronger legal posture around attribution and excerpt size. Product teams are responding by storing metadata, generated summaries, canonical links, and takedown paths instead of scraping or redistributing full article text. The practical consensus is to summarize, cite, and send readers back to the original source wherever possible.',
    category: 'Legal',
    imageUrl: 'https://images.unsplash.com/photo-1505664194779-8beaceb93744?auto=format&fit=crop&w=1200&q=80',
    publishedAt: '2026-06-04T16:00:00.000Z',
  },
  {
    id: 'agent-ops-observability',
    sourceName: 'Stack Observer',
    sourceType: 'BLOG',
    sourceBaseUrl: 'https://example.com',
    sourceUrl: 'https://example.com/stack-observer/agent-ops-observability',
    title: 'Agent observability becomes a required layer for enterprise deployments',
    excerpt:
      'Tracing, approval logs, and prompt-level telemetry are becoming baseline requirements before organizations approve wider agentic automation.',
    body:
      'Engineering teams are treating agent observability as core infrastructure. Teams want traces for prompts, tools, human approvals, and failures so they can debug behavior and satisfy audit expectations. This is especially important when external APIs, customer data, or regulated workflows are involved.',
    category: 'Operations',
    imageUrl: 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&w=1200&q=80',
    publishedAt: '2026-06-03T13:45:00.000Z',
  },
];
