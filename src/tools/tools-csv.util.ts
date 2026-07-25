import type { AdminToolInput, ToolFaqInput, ToolFeatureNoteInput } from './tools.types';

/** RFC4180-style CSV parser: handles quoted fields with embedded commas, newlines, and escaped quotes ("&quot;"). */
export function parseCsv(text: string): string[][] {
  const source = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let i = 0;

  while (i < source.length) {
    const char = source[i];

    if (inQuotes) {
      if (char === '"') {
        if (source[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += char;
      i += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }

    if (char === ',') {
      row.push(field);
      field = '';
      i += 1;
      continue;
    }

    if (char === '\r') {
      i += 1;
      continue;
    }

    if (char === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      i += 1;
      continue;
    }

    field += char;
    i += 1;
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter((cells) => !(cells.length === 1 && cells[0].trim() === ''));
}

function cellValue(row: string[], headerIndex: Map<string, number>, name: string): string {
  const idx = headerIndex.get(name);
  if (idx === undefined) return '';
  return (row[idx] ?? '').trim();
}

function toBoolField(value: string): boolean {
  const v = value.trim().toLowerCase();
  return v === 'true' || v === 'yes' || v === '1';
}

/** freePlan is a display string ("Yes" | "No" | "Limited" | free text), not a boolean column. */
function toFreePlanField(value: string): string {
  const v = value.trim();
  if (!v) return '';
  const lower = v.toLowerCase();
  if (lower === 'true' || lower === 'yes' || lower === '1') return 'Yes';
  if (lower === 'false' || lower === 'no' || lower === '0') return 'No';
  if (lower === 'limited') return 'Limited';
  return v;
}

function toNullableBoolField(value: string): boolean | null {
  const v = value.trim().toLowerCase();
  if (!v) return null;
  return v === 'true' || v === 'yes' || v === '1';
}

function toNumberField(value: string): number | null {
  const v = value.trim();
  if (!v) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function toPipeArray(value: string): string[] {
  return value
    .split('|')
    .map((item) => item.trim())
    .filter(Boolean);
}

function toFaqArray(value: string): ToolFaqInput[] {
  return value
    .split('|')
    .map((pair) => pair.trim())
    .filter(Boolean)
    .map((pair) => {
      const [question, ...rest] = pair.split('::');
      return { question: (question ?? '').trim(), answer: rest.join('::').trim() };
    })
    .filter((item): item is ToolFaqInput => Boolean(item.question && item.answer));
}

function toFeatureNoteArray(value: string): ToolFeatureNoteInput[] {
  return value
    .split('|')
    .map((pair) => pair.trim())
    .filter(Boolean)
    .map((pair) => {
      const [feature, ...rest] = pair.split('::');
      return { feature: (feature ?? '').trim(), benefit: rest.join('::').trim() };
    })
    .filter((item): item is ToolFeatureNoteInput => Boolean(item.feature && item.benefit));
}

/** Maps one CSV data row to the same shape accepted by the JSON bulk-upsert endpoint. */
export function mapCsvRowToAdminToolInput(headerIndex: Map<string, number>, row: string[]): AdminToolInput {
  const get = (name: string) => cellValue(row, headerIndex, name);

  return {
    sourceName: get('sourceName') || undefined,
    sourceType: get('sourceType') || undefined,
    rank: toNumberField(get('rank')),
    name: get('name'),
    slug: get('slug') || undefined,
    category: get('category'),
    subcategory: get('subcategory') || undefined,
    company: get('company') || undefined,
    website: get('website') || undefined,
    domain: get('domain') || undefined,
    favicon: get('favicon') || undefined,
    logoUrl: get('logoUrl') || null,
    freePlan: toFreePlanField(get('freePlan')) || undefined,
    freeTrial: toBoolField(get('freeTrial')),
    pricingModel: get('pricingModel') || undefined,
    startingPriceUsd: toNumberField(get('startingPriceUsd')),
    pricingNotes: get('pricingNotes') || null,
    shortDescription: get('shortDescription'),
    summary: get('summary') || null,
    features: toPipeArray(get('features')),
    bestFor: toPipeArray(get('bestFor')),
    targetAudience: toPipeArray(get('targetAudience')),
    tags: toPipeArray(get('tags')),
    aiType: toPipeArray(get('aiType')),
    modalities: toPipeArray(get('modalities')),
    modelProvider: toPipeArray(get('modelProvider')),
    modelNames: toPipeArray(get('modelNames')),
    apiAvailable: toBoolField(get('apiAvailable')),
    openSource: toBoolField(get('openSource')),
    deploymentType: toPipeArray(get('deploymentType')),
    platforms: toPipeArray(get('platforms')),
    integrations: toPipeArray(get('integrations')),
    teamCollaboration: toNullableBoolField(get('teamCollaboration')),
    security: toPipeArray(get('security')),
    privacyNotes: get('privacyNotes') || null,
    status: get('status') || undefined,
    launchYear: toNumberField(get('launchYear')),
    lastVerified: get('lastVerified') || null,
    sourceUrl: get('sourceUrl') || undefined,
    pros: toPipeArray(get('pros')),
    cons: toPipeArray(get('cons')),
    editorialVerdict: get('editorialVerdict') || null,
    alternativesNote: get('alternativesNote') || null,
    faqs: toFaqArray(get('faqs')),
    featureNotes: toFeatureNoteArray(get('featureNotes')),
  };
}

export type CsvRowError = { row: number; error: string };

/** Parses a full CSV document into AdminToolInput rows, keyed by data-row number (1-based, header excluded). */
export function parseAdminToolsCsv(text: string): { inputs: AdminToolInput[]; rowNumbers: number[]; errors: CsvRowError[] } {
  const rows = parseCsv(text);
  const inputs: AdminToolInput[] = [];
  const rowNumbers: number[] = [];
  const errors: CsvRowError[] = [];

  if (rows.length === 0) {
    return { inputs, rowNumbers, errors };
  }

  const headers = rows[0].map((header) => header.trim());
  const headerIndex = new Map(headers.map((header, index) => [header, index]));

  if (!headerIndex.has('name') || !headerIndex.has('category') || !headerIndex.has('shortDescription')) {
    errors.push({
      row: 0,
      error: 'CSV header must include at least name, category, and shortDescription columns.',
    });
    return { inputs, rowNumbers, errors };
  }

  for (let i = 1; i < rows.length; i += 1) {
    const row = rows[i];
    if (row.every((cell) => cell.trim() === '')) continue;

    const rowNumber = i + 1;
    const input = mapCsvRowToAdminToolInput(headerIndex, row);

    if (!input.name || !input.category || !input.shortDescription) {
      errors.push({ row: rowNumber, error: 'Missing required name, category, or shortDescription.' });
      continue;
    }

    inputs.push(input);
    rowNumbers.push(rowNumber);
  }

  return { inputs, rowNumbers, errors };
}
