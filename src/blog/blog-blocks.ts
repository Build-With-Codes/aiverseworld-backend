import { HTMLElement, parse } from 'node-html-parser';

export type Block =
  | { type: 'heading'; level: 2 | 3 | 4; html: string }
  | { type: 'paragraph'; html: string }
  | { type: 'list'; ordered: boolean; items: string[] }
  | { type: 'quote'; html: string }
  | { type: 'code'; code: string; lang?: string }
  | { type: 'table'; head: string[]; rows: string[][] }
  | {
      type: 'image';
      src: string;
      alt?: string;
      caption?: string;
      width?: number;
      height?: number;
    }
  | { type: 'divider' };

const WRAPPER_TAGS = new Set(['div', 'section', 'article', 'main', 'span']);

/** Strip anything script-like from trusted inline HTML as a defensive measure. */
function sanitizeInline(html: string): string {
  return html
    .replace(/<\s*(script|style)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, '')
    .replace(/\son\w+="[^"]*"/gi, '')
    .replace(/\son\w+='[^']*'/gi, '')
    .replace(/javascript:/gi, '')
    .trim();
}

function parseTable(el: HTMLElement): Block | null {
  const trs = el.querySelectorAll('tr');
  if (trs.length === 0) return null;

  let head: string[] = [];
  const rows: string[][] = [];

  trs.forEach((tr, index) => {
    const cells = tr.querySelectorAll('th,td').map((c) => sanitizeInline(c.innerHTML));
    if (cells.length === 0) return;
    const hasHeaderCells = tr.querySelectorAll('th').length > 0;
    if (index === 0 && hasHeaderCells && head.length === 0) {
      head = cells;
    } else {
      rows.push(cells);
    }
  });

  if (head.length === 0 && rows.length > 0) head = rows.shift() as string[];
  if (head.length === 0 && rows.length === 0) return null;
  return { type: 'table', head, rows };
}

function elementToBlocks(el: HTMLElement): Block[] {
  const tag = el.tagName?.toLowerCase();

  switch (tag) {
    case 'h2':
    case 'h3':
    case 'h4': {
      const html = sanitizeInline(el.innerHTML);
      if (!html) return [];
      const level = (Number(tag[1]) as 2 | 3 | 4) ?? 2;
      return [{ type: 'heading', level, html }];
    }
    case 'p': {
      const html = sanitizeInline(el.innerHTML);
      // A <p> that only wraps an image → image block.
      const img = el.querySelector('img');
      if (img && el.text.trim() === '') {
        return imageBlock(img);
      }
      return html ? [{ type: 'paragraph', html }] : [];
    }
    case 'ul':
    case 'ol': {
      const items = el
        .querySelectorAll('li')
        .map((li) => sanitizeInline(li.innerHTML))
        .filter(Boolean);
      return items.length ? [{ type: 'list', ordered: tag === 'ol', items }] : [];
    }
    case 'blockquote': {
      const html = sanitizeInline(el.innerHTML);
      return html ? [{ type: 'quote', html }] : [];
    }
    case 'pre': {
      const codeEl = el.querySelector('code') ?? el;
      const code = codeEl.text.replace(/ /g, ' ');
      const langClass = codeEl.getAttribute('class') ?? '';
      const langMatch = langClass.match(/language-([a-z0-9]+)/i);
      return code.trim()
        ? [{ type: 'code', code, ...(langMatch ? { lang: langMatch[1] } : {}) }]
        : [];
    }
    case 'table': {
      const block = parseTable(el);
      return block ? [block] : [];
    }
    case 'figure': {
      const img = el.querySelector('img');
      if (!img) return [];
      const blocks = imageBlock(img);
      const caption = el.querySelector('figcaption')?.text.trim();
      if (blocks[0]?.type === 'image' && caption) blocks[0].caption = caption;
      return blocks;
    }
    case 'img':
      return imageBlock(el);
    case 'hr':
      return [{ type: 'divider' }];
    default:
      if (tag && WRAPPER_TAGS.has(tag)) {
        return childrenToBlocks(el);
      }
      // Unknown element with text → treat as paragraph.
      {
        const html = sanitizeInline(el.innerHTML);
        return html ? [{ type: 'paragraph', html }] : [];
      }
  }
}

function imageBlock(img: HTMLElement): Block[] {
  const src = img.getAttribute('src');
  if (!src) return [];
  const width = Number(img.getAttribute('width')) || undefined;
  const height = Number(img.getAttribute('height')) || undefined;
  return [
    {
      type: 'image',
      src,
      alt: img.getAttribute('alt') || undefined,
      width,
      height,
    },
  ];
}

function childrenToBlocks(root: HTMLElement): Block[] {
  const blocks: Block[] = [];
  for (const node of root.childNodes) {
    if (node instanceof HTMLElement) {
      blocks.push(...elementToBlocks(node));
    } else {
      // Bare text node between block elements → paragraph.
      const text = node.text.replace(/\s+/g, ' ').trim();
      if (text) blocks.push({ type: 'paragraph', html: text });
    }
  }
  return blocks;
}

/** Convert a trusted HTML article body into a block array. */
export function htmlToBlocks(html: string): Block[] {
  if (!html?.trim()) return [];
  const root = parse(html, { blockTextElements: { pre: true, code: true } });
  return childrenToBlocks(root);
}
