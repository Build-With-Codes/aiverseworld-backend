import { Prisma } from '@prisma/client';

export type RagToolRecord = {
  id: string;
  name: string;
  slug: string;
  category: string;
  subcategory: string;
  company: string;
  shortDescription: string;
  summary: string | null;
  features: Prisma.JsonValue;
  bestFor: Prisma.JsonValue;
  targetAudience: Prisma.JsonValue;
  tags: Prisma.JsonValue;
  aiType: Prisma.JsonValue;
  modalities: Prisma.JsonValue;
  modelProvider: Prisma.JsonValue;
  platforms: Prisma.JsonValue;
  pricingModel: string;
  freePlan: string;
  freeTrial: boolean;
  apiAvailable: boolean;
  openSource: boolean;
  status: string;
  popularityScore: number | null;
  rating: number | null;
  searchText: string;
  updatedAt: Date;
};

export type RagRecommendation = {
  toolId: string;
  score: number;
  reason: string;
  matchedContext: string;
};
