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

// ⚡ Detect if Prisma is running a migration command
const isMigrationCmd = 
  process.argv.some(arg => arg.includes('migrate') || arg.includes('db'));

// 🚀 Use DIRECT_URL for migrations, fallback to DATABASE_URL for standard generation/API runtime
const rawConnectionString = isMigrationCmd
  ? (process.env['DIRECT_URL'] ?? process.env['DIRECT_DATABASE_URL'] ?? process.env['DATABASE_URL'])
  : (process.env['DATABASE_URL'] ?? process.env['DIRECT_URL']);

if (!rawConnectionString) {
  throw new Error("Missing required database connection string environment variable.");
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    url: withSchema(rawConnectionString),
  },
});
