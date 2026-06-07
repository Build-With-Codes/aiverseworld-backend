import { Injectable, Logger } from '@nestjs/common';
import { getNewsFeedSources, type NewsFeedSource } from './news-sources';
import type { NewsSourceArticle } from './news.types';

type ParsedFeedItem = {
  guid?: string;
  title: string;
  link: string;
  description: string;
  publishedAt: string;
  imageUrl?: string;
};

function decodeXml(value: string) {
  return value
    .replace(/<!\[CDATA\[(.*?)\]\]>/gs, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function stripHtml(value: string) {
  return decodeXml(value).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function getTagValue(block: string, tagNames: string[]) {
  for (const tagName of tagNames) {
    const match = block.match(new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, 'i'));

    if (match?.[1]) {
      return stripHtml(match[1]);
    }
  }

  return '';
}

function getImageUrl(block: string) {
  const enclosureMatch = block.match(
    /<enclosure[^>]+url="([^"]+)"[^>]+type="image\/[^"]+"[^>]*\/?>/i,
  );

  if (enclosureMatch?.[1]) {
    return enclosureMatch[1];
  }

  const mediaMatch = block.match(/<media:content[^>]+url="([^"]+)"[^>]*\/?>/i);

  if (mediaMatch?.[1]) {
    return mediaMatch[1];
  }

  const imageInHtmlMatch = block.match(/<img[^>]+src="([^"]+)"/i);

  return imageInHtmlMatch?.[1];
}

function normalizePublishedAt(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return new Date().toISOString();
  }

  return date.toISOString();
}

function stripHtmlTags(value: string) {
  return value.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function normalizeUrl(baseUrl: string, href: string) {
  try {
    return new URL(href, baseUrl).toString();
  } catch {
    return '';
  }
}

function isLikelyArticleTitle(value: string) {
  const normalized = value.trim();

  if (normalized.length < 24 || normalized.length > 220) {
    return false;
  }

  const blockedPhrases = [
    'learn more',
    'read more',
    'sign up',
    'subscribe',
    'privacy',
    'terms',
    'cookie',
    'careers',
    'contact us',
    'about us',
    'research areas',
    'our products',
    'skip to',
  ];

  const lowercase = normalized.toLowerCase();
  return !blockedPhrases.some((phrase) => lowercase.includes(phrase));
}

function toArticleId(sourceName: string, link: string, title: string) {
  const raw = `${sourceName}-${link || title}`.toLowerCase();
  let hash = 0;

  for (let index = 0; index < raw.length; index += 1) {
    hash = (hash * 31 + raw.charCodeAt(index)) | 0;
  }

  return `feed-${Math.abs(hash)}`;
}

@Injectable()
export class NewsCollectorService {
  private readonly logger = new Logger(NewsCollectorService.name);

  async collect(limit = 20) {
    if (process.env.NEWS_DISABLE_REMOTE_FETCH === 'true') {
      return [];
    }

    const sources = getNewsFeedSources();
    const collected = await Promise.all(
      sources.map((source) => this.fetchSource(source)),
    );

    const deduped = new Map<string, NewsSourceArticle>();

    for (const article of collected.flat()) {
      const key = article.sourceUrl || article.title.toLowerCase();

      if (!deduped.has(key)) {
        deduped.set(key, article);
      }
    }

    return Array.from(deduped.values())
      .sort((left, right) => right.publishedAt.localeCompare(left.publishedAt))
      .slice(0, limit);
  }

  private async fetchSource(source: NewsFeedSource) {
    try {
      const response = await fetch(source.url, {
        headers: {
          'User-Agent':
            process.env.NEWS_FETCH_USER_AGENT ??
            'AiverseWorldNewsBot/1.0 (+https://aiverseworld.example)',
          Accept:
            source.type === 'HTML'
              ? 'text/html,application/xhtml+xml'
              : 'application/rss+xml, application/xml, text/xml, application/atom+xml',
        },
      });

      if (!response.ok) {
        this.logger.warn(`Feed request failed for ${source.url}: ${response.status}`);
        return [];
      }

      const xml = await response.text();
      const items =
        source.type === 'HTML'
          ? this.parseHtmlFeed(source, xml)
          : this.parseFeed(xml);

      return items.map((item) => this.toSourceArticle(source, item));
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown feed collection error';
      this.logger.warn(`Feed request failed for ${source.url}: ${message}`);
      return [];
    }
  }

  private parseFeed(xml: string): ParsedFeedItem[] {
    const itemBlocks = xml.match(/<item\b[\s\S]*?<\/item>/gi);

    if (itemBlocks?.length) {
      return itemBlocks
        .map((block) => ({
          guid: getTagValue(block, ['guid']),
          title: getTagValue(block, ['title']),
          link: getTagValue(block, ['link']),
          description: getTagValue(block, ['description', 'content:encoded']),
          publishedAt: normalizePublishedAt(
            getTagValue(block, ['pubDate', 'published', 'updated']),
          ),
          imageUrl: getImageUrl(block),
        }))
        .filter((item) => item.title && item.link);
    }

    const entryBlocks = xml.match(/<entry\b[\s\S]*?<\/entry>/gi) ?? [];

    return entryBlocks
      .map((block) => {
        const linkMatch = block.match(/<link[^>]+href="([^"]+)"/i);

        return {
          guid: getTagValue(block, ['id']),
          title: getTagValue(block, ['title']),
          link: linkMatch?.[1] ?? '',
          description: getTagValue(block, ['summary', 'content']),
          publishedAt: normalizePublishedAt(
            getTagValue(block, ['updated', 'published']),
          ),
          imageUrl: getImageUrl(block),
        };
      })
      .filter((item) => item.title && item.link);
  }

  private parseHtmlFeed(source: NewsFeedSource, html: string): ParsedFeedItem[] {
    const anchorRegex = /<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
    const items: ParsedFeedItem[] = [];
    const seenLinks = new Set<string>();
    const allowedHosts = source.allowedHosts ?? [new URL(source.baseUrl).hostname];
    const pathIncludes = source.pathIncludes ?? [];
    const now = Date.now();

    for (const [index, match] of Array.from(html.matchAll(anchorRegex)).entries()) {
      const link = normalizeUrl(source.baseUrl, match[1] ?? '');

      if (!link || seenLinks.has(link)) {
        continue;
      }

      let parsed: URL;
      try {
        parsed = new URL(link);
      } catch {
        continue;
      }

      if (!allowedHosts.includes(parsed.hostname)) {
        continue;
      }

      if (
        pathIncludes.length > 0 &&
        !pathIncludes.some((segment) => parsed.pathname.includes(segment))
      ) {
        continue;
      }

      const title = stripHtmlTags(decodeXml(match[2] ?? ''));

      if (!isLikelyArticleTitle(title)) {
        continue;
      }

      seenLinks.add(link);
      items.push({
        guid: link,
        title,
        link,
        description: title,
        publishedAt: new Date(now - index * 60_000).toISOString(),
      });

      if (items.length >= 12) {
        break;
      }
    }

    return items;
  }

  private toSourceArticle(
    source: NewsFeedSource,
    item: ParsedFeedItem,
  ): NewsSourceArticle {
    const excerpt = item.description.slice(0, 280).trim();

    return {
      id: item.guid || toArticleId(source.name, item.link, item.title),
      externalId: item.guid || undefined,
      sourceName: source.name,
      sourceType: source.type,
      sourceBaseUrl: source.baseUrl,
      sourceUrl: item.link,
      title: item.title,
      excerpt,
      body: item.description || excerpt || item.title,
      category: source.category ?? this.detectCategory(item.title, item.description),
      imageUrl:
        item.imageUrl ??
        'https://images.unsplash.com/photo-1495020689067-958852a7765e?auto=format&fit=crop&w=1200&q=80',
      author: undefined,
      publishedAt: item.publishedAt,
    };
  }

  private detectCategory(title: string, description: string) {
    const haystack = `${title} ${description}`.toLowerCase();

    if (haystack.includes('policy') || haystack.includes('regulation')) {
      return 'Legal';
    }

    if (
      haystack.includes('agent') ||
      haystack.includes('infrastructure') ||
      haystack.includes('model')
    ) {
      return 'Infrastructure';
    }

    if (
      haystack.includes('security') ||
      haystack.includes('governance') ||
      haystack.includes('compliance')
    ) {
      return 'Governance';
    }

    return 'AI';
  }
}
