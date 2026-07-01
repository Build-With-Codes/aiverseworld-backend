export type ProblemSort = 'newest' | 'oldest' | 'pain' | 'ai-score';

export type ProblemVote = 'aiSolvable' | 'notAiSolvable';

export type CreateProblemInput = {
  title: string;
  description: string;
  industry: string;
  frequency: string;
  painScore: number;
  email?: string;
};

export type ListProblemsInput = {
  page: number;
  limit: number;
  industry?: string;
  search?: string;
  sort: ProblemSort;
};
