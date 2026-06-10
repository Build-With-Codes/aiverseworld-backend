export const drawGuessCategories = [
  'Animals',
  'Food',
  'Objects',
  'Technology',
  'Random',
] as const;

export const drawGuessDifficulties = ['Easy', 'Medium', 'Hard'] as const;

export type DrawGuessCategory = (typeof drawGuessCategories)[number];
export type DrawGuessDifficulty = (typeof drawGuessDifficulties)[number];

export type DrawGuessWord = {
  answer: string;
  category: Exclude<DrawGuessCategory, 'Random'>;
  difficulty: DrawGuessDifficulty;
};

export type DrawGuessRoundResponse = {
  roundId: string;
  svg: string;
  answer: string;
  category: DrawGuessCategory;
  difficulty: DrawGuessDifficulty;
};
