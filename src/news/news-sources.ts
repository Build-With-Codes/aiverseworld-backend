export type NewsFeedSource = {
  name: string;
  type: string;
  url: string;
  baseUrl: string;
  allowedHosts?: string[];
  pathIncludes?: string[];
  category?: string;
  pollIntervalMinutes: number;
};

const defaultFeedSources: NewsFeedSource[] = [
  {
    name: 'OpenAI News',
    type: 'RSS',
    url: 'https://openai.com/news/rss.xml',
    baseUrl: 'https://openai.com',
    category: 'AI',
    pollIntervalMinutes: 15,
  },
  {
    name: 'Anthropic News',
    type: 'RSS',
    url: 'https://www.anthropic.com/news/rss.xml',
    baseUrl: 'https://www.anthropic.com',
    category: 'AI',
    pollIntervalMinutes: 15,
  },
  {
    name: 'Hugging Face Blog',
    type: 'RSS',
    url: 'https://huggingface.co/blog/feed.xml',
    baseUrl: 'https://huggingface.co',
    category: 'AI',
    pollIntervalMinutes: 15,
  },
];

function parseFeedList(value: string) {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item, index) => ({
      name: `Custom Feed ${index + 1}`,
      type: 'RSS',
      url: item,
      baseUrl: item,
      category: 'AI',
      pollIntervalMinutes: 15,
    }));
}

export function getNewsFeedSources() {
  const configuredFeeds = process.env.NEWS_RSS_FEEDS;

  if (configuredFeeds) {
    return parseFeedList(configuredFeeds);
  }

  return defaultFeedSources;
}
