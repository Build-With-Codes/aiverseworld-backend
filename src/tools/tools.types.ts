export type ToolSort = 'rank' | 'popular' | 'rating' | 'newest';

export type ListToolsInput = {
  page: number;
  limit: number;
  search?: string;
  category?: string;
  pricing?: string;
  platform?: string;
  freeOnly?: boolean;
  apiOnly?: boolean;
  openSourceOnly?: boolean;
  sort: ToolSort;
};

export type AdminToolInput = {
  sourceName?: string;
  sourceType?: string;
  rank?: number | null;
  name: string;
  slug?: string;
  category: string;
  subcategory?: string;
  company?: string;
  website?: string;
  domain?: string;
  favicon?: string;
  logoUrl?: string | null;
  freePlan?: string;
  freeTrial?: boolean;
  pricingModel?: string;
  startingPriceUsd?: number | null;
  pricingNotes?: string | null;
  shortDescription: string;
  summary?: string | null;
  features?: string[];
  bestFor?: string[];
  targetAudience?: string[];
  tags?: string[];
  aiType?: string[];
  modalities?: string[];
  modelProvider?: string[];
  modelNames?: string[];
  apiAvailable?: boolean;
  openSource?: boolean;
  deploymentType?: string[];
  platforms?: string[];
  integrations?: string[];
  teamCollaboration?: boolean | null;
  security?: string[];
  privacyNotes?: string | null;
  popularityScore?: number | null;
  rating?: number | null;
  reviewCount?: number | null;
  status?: string;
  launchYear?: number | null;
  lastVerified?: string | null;
  sourceUrl?: string;
};

export type AdminToolUpdateInput = Partial<AdminToolInput> & {
  sourceName?: string;
  sourceType?: string;
};
