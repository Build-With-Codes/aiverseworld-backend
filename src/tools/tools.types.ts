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
