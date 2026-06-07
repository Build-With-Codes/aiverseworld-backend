import { NewsCollectorService } from './news-collector.service';

describe('NewsCollectorService', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    delete process.env.NEWS_DISABLE_REMOTE_FETCH;
  });

  it('parses RSS items from a public feed response', async () => {
    const service = new NewsCollectorService();

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      text: async () => `<?xml version="1.0"?>
        <rss version="2.0">
          <channel>
            <item>
              <title>AI teams harden governance</title>
              <link>https://example.com/story-1</link>
              <description><![CDATA[Enterprise teams are building stronger review controls.]]></description>
              <pubDate>Sat, 06 Jun 2026 09:00:00 GMT</pubDate>
              <guid>story-1</guid>
            </item>
          </channel>
        </rss>`,
    }) as typeof fetch;

    const articles = await service.collect(5);

    expect(articles.length).toBeGreaterThan(0);
    expect(articles[0]).toMatchObject({
      id: 'story-1',
      sourceUrl: 'https://example.com/story-1',
      title: 'AI teams harden governance',
    });
  });

  it('skips remote fetch when disabled', async () => {
    process.env.NEWS_DISABLE_REMOTE_FETCH = 'true';
    const service = new NewsCollectorService();

    const articles = await service.collect(5);

    expect(articles).toEqual([]);
  });
});
