export type EnglishTutorTurnRequest = {
  transcript?: string;
  sessionId?: string;
  focus?: string;
  userId?: string;
};

export type EnglishTutorTurnResponse = {
  sessionId: string;
  transcript: string;
  reply: string;
  correction: string;
  score: number;
  focus: string;
  nextQuestion: string;
};

export type EnglishTutorRealtimeRequest = {
  focus?: string;
  userId?: string;
};

export type EnglishTutorRealtimeSession = {
  sessionId: string;
  realtimeModel: string;
  voice: string;
  instructions: string;
};

export type EnglishTutorSaveTurnRequest = {
  sessionId?: string;
  userId?: string;
  userText?: string;
  tutorText?: string;
  correction?: string;
  focus?: string;
  provider?: string;
};

export type EnglishTutorProgressResponse = {
  enabled: boolean;
  sessions: Array<{
    id: string;
    focus: string;
    averageScore: number | null;
    startedAt: string;
    turnCount: number;
  }>;
  commonMistakes: Array<{
    mistake: string;
    correction: string;
    category: string;
    count: number;
  }>;
};
