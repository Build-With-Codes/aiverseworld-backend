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

// 🚀 ALWAYS use DATABASE_URL for everything (migrations, runtime, etc.)
const rawConnectionString = process.env['DATABASE_URL'];

if (!rawConnectionString) {
  throw new Error("Missing required database connection string environment variable.");
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    url: withSchema(rawConnectionString),
  },
});
