import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Pool } from 'pg';

type ProblemSeed = {
  id: string;
  title: string;
  description: string;
  industry: string;
  frequency: string;
  painScore: number;
  email?: string;
  createdAt: string;
  votes?: {
    aiSolvable?: number;
    notAiSolvable?: number;
  };
};

const schemaName = 'aiverse_world';

function withSchema(raw: string) {
  try {
    const url = new URL(raw);
    url.searchParams.set('schema', schemaName);
    return url.toString();
  } catch {
    return raw;
  }
}

async function main() {
  const databaseUrl = process.env.DIRECT_URL ?? process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error('Set DIRECT_URL, DIRECT_DATABASE_URL, or DATABASE_URL before importing problems.');
  }

  const problemsPath = join(process.cwd(), '..', 'aiinverseworld', 'data', 'problems.json');
  const problems = JSON.parse(await readFile(problemsPath, 'utf8')) as ProblemSeed[];
  const pool = new Pool({ connectionString: withSchema(databaseUrl) });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  try {
    await prisma.$executeRawUnsafe(`CREATE SCHEMA IF NOT EXISTS "${schemaName}"`);

    for (const problem of problems) {
      const data = {
        title: problem.title.trim(),
        description: problem.description.trim(),
        industry: problem.industry.trim(),
        frequency: problem.frequency.trim(),
        painScore: Math.max(1, Math.min(10, Number(problem.painScore) || 1)),
        email: problem.email?.trim() || null,
        aiSolvable: Math.max(0, Number(problem.votes?.aiSolvable) || 0),
        notAiSolvable: Math.max(0, Number(problem.votes?.notAiSolvable) || 0),
        createdAt: new Date(problem.createdAt),
      };

      await prisma.problem.upsert({
        where: { id: problem.id },
        update: data,
        create: {
          id: problem.id,
          ...data,
        },
      });
    }

    console.log(`Imported ${problems.length} problems into Postgres.`);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
