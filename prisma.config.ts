import "dotenv/config";
import { defineConfig } from "prisma/config";

function withSchema(raw: string | undefined) {
  if (!raw) return undefined;
  try {
    const url = new URL(raw);
    url.searchParams.set('schema', 'aiverse_world');
    return url.toString();
  } catch {
    return raw;
  }
}

const directUrl = process.env['DIRECT_URL'] ?? process.env['DIRECT_DATABASE_URL'];

if (!directUrl) {
  throw new Error(
    'DIRECT_URL or DIRECT_DATABASE_URL is required for Prisma migrations. Runtime APIs must use DATABASE_URL separately.',
  );
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    url: withSchema(directUrl),
  },
});

