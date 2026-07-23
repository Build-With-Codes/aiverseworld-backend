/**
 * Spotlight configuration — code/config-driven for now. Each slot renders a
 * premium "spotlight" on the homepage. Tools are selected deterministically
 * (date-seeded) from a strategy pool so they rotate on a stable schedule, OR
 * pinned editorially via `pinnedSlug`.
 *
 * SEAM: a future admin CMS writes `pinnedSlug` (and could add slots) here /
 * to a Spotlight table without any change to the consuming frontend.
 */

export type SpotlightStrategy =
  | 'daily'
  | 'weekly'
  | 'monthly'
  | 'rising'
  | 'editors-choice'
  | 'highest-rated';

export type SpotlightSlot = {
  key: string;
  emoji: string;
  label: string;
  blurb: string;
  strategy: SpotlightStrategy;
  /** Editorial override — when set, this tool slug always wins for the slot. */
  pinnedSlug?: string;
};

export const spotlightSlots: SpotlightSlot[] = [
  {
    key: 'tool-of-the-day',
    emoji: '⭐',
    label: 'AI Tool of the Day',
    blurb: 'A fresh pick our editors think is worth a look today.',
    strategy: 'daily',
  },
  {
    key: 'tool-of-the-week',
    emoji: '🏆',
    label: 'AI Tool of the Week',
    blurb: 'The standout tool people are shortlisting this week.',
    strategy: 'weekly',
  },
  {
    key: 'tool-of-the-month',
    emoji: '👑',
    label: 'AI Tool of the Month',
    blurb: "This month's most impressive AI platform.",
    strategy: 'monthly',
  },
  {
    key: 'rising',
    emoji: '🚀',
    label: 'Rising AI Tool',
    blurb: 'Fast-growing momentum based on recent activity.',
    strategy: 'rising',
  },
  {
    key: 'editors-choice',
    emoji: '🎯',
    label: "Editor's Choice",
    blurb: 'A consistently excellent tool we keep recommending.',
    strategy: 'editors-choice',
  },
  {
    key: 'highest-rated',
    emoji: '🏅',
    label: 'Highest Rated',
    blurb: 'Top of the catalog by community rating.',
    strategy: 'highest-rated',
  },
];
