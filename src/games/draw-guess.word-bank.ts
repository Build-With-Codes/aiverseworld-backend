import type {
  DrawGuessCategory,
  DrawGuessDifficulty,
  DrawGuessWord,
} from './draw-guess.types';

const words: DrawGuessWord[] = [
  { answer: 'cat', category: 'Animals', difficulty: 'Easy' },
  { answer: 'fish', category: 'Animals', difficulty: 'Easy' },
  { answer: 'bird', category: 'Animals', difficulty: 'Medium' },
  { answer: 'turtle', category: 'Animals', difficulty: 'Hard' },
  { answer: 'apple', category: 'Food', difficulty: 'Easy' },
  { answer: 'pizza', category: 'Food', difficulty: 'Easy' },
  { answer: 'burger', category: 'Food', difficulty: 'Medium' },
  { answer: 'ice cream', category: 'Food', difficulty: 'Hard' },
  { answer: 'chair', category: 'Objects', difficulty: 'Easy' },
  { answer: 'key', category: 'Objects', difficulty: 'Easy' },
  { answer: 'lamp', category: 'Objects', difficulty: 'Medium' },
  { answer: 'backpack', category: 'Objects', difficulty: 'Hard' },
  { answer: 'robot', category: 'Technology', difficulty: 'Easy' },
  { answer: 'laptop', category: 'Technology', difficulty: 'Medium' },
  { answer: 'mouse', category: 'Technology', difficulty: 'Medium' },
  { answer: 'rocket', category: 'Technology', difficulty: 'Hard' },
];

export function pickRandomWord(
  category: DrawGuessCategory,
  difficulty: DrawGuessDifficulty,
) {
  const scopedWords = words.filter(
    (word) =>
      (category === 'Random' || word.category === category) &&
      word.difficulty === difficulty,
  );

  const pool = scopedWords.length > 0 ? scopedWords : words;
  return pool[Math.floor(Math.random() * pool.length)];
}
