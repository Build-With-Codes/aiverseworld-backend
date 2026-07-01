import type { EmbeddingsInterface } from '@langchain/core/embeddings';

const defaultDimensions = 1024;

function getDimensions() {
  const configured = Number(process.env.AI_TOOL_EMBEDDING_DIMENSION ?? defaultDimensions);

  return Number.isFinite(configured) && configured > 0
    ? Math.floor(configured)
    : defaultDimensions;
}

function hashToken(token: string) {
  let hash = 2166136261;

  for (let index = 0; index < token.length; index += 1) {
    hash ^= token.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function tokenize(value: string) {
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 1);
}

function normalize(vector: number[]) {
  const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));

  if (!magnitude) {
    return vector;
  }

  return vector.map((value) => value / magnitude);
}

function embedText(value: string) {
  const dimensions = getDimensions();
  const vector = Array.from({ length: dimensions }, () => 0);

  for (const token of tokenize(value)) {
    const hash = hashToken(token);
    const index = hash % dimensions;
    vector[index] += hash % 2 === 0 ? 1 : -1;
  }

  return normalize(vector);
}

export class LocalHashEmbeddings implements EmbeddingsInterface {
  modelName = 'local-hash-embedding-v1';
  dimensions = getDimensions();

  async embedDocuments(documents: string[]) {
    return documents.map(embedText);
  }

  async embedQuery(document: string) {
    return embedText(document);
  }
}
