require('dotenv/config');

const { spawnSync } = require('node:child_process');
const path = require('node:path');
const { Client } = require('pg');

const SCHEMA_NAME = 'aiverse_world';
const ALLOW_UNREACHABLE =
  process.argv.includes('--allow-unreachable') &&
  process.env.ALLOW_UNREACHABLE_MIGRATIONS === 'true';
const REACHABILITY_ERROR_CODES = ['P1001', 'P1002'];

const BASELINE_MIGRATIONS = [
  {
    name: '20260606150000_init',
    tables: ['NewsPipelineRun'],
  },
  {
    name: '20260606170000_enterprise_pipeline',
    tables: ['NewsSource', 'RawArticle', 'AiArticle'],
  },
  {
    name: '20260610160000_english_tutor_pipeline',
    tables: ['EnglishTutorSession', 'EnglishTutorTurn', 'EnglishTutorMistake'],
  },
  {
    name: '20260629110000_problem_catalog',
    tables: ['Problem'],
  },
  {
    name: '20260629120000_ai_tool_catalog',
    tables: ['AiToolSource', 'AiTool'],
  },
  {
    name: '20260629130000_ai_tool_vector_index',
    tables: ['AiToolEmbedding'],
  },
];

function withSchema(raw) {
  if (!raw) return raw;
  const url = new URL(raw);
  url.searchParams.set('schema', SCHEMA_NAME);
  return url.toString();
}

function getDatabaseUrl() {
  const raw = process.env.DIRECT_URL ?? process.env.DIRECT_DATABASE_URL;
  if (!raw) {
    throw new Error(
      'DIRECT_URL or DIRECT_DATABASE_URL is required to deploy Prisma migrations. Runtime DATABASE_URL is intentionally not used for migrations.',
    );
  }
  return withSchema(raw);
}

function runPrisma(args, options = {}) {
  const command = path.join(
    process.cwd(),
    'node_modules',
    '.bin',
    process.platform === 'win32' ? 'prisma.cmd' : 'prisma',
  );
  const spawnCommand = process.platform === 'win32' ? 'cmd.exe' : command;
  const spawnArgs =
    process.platform === 'win32'
      ? ['/d', '/c', ['call', command, ...args].join(' ')]
      : args;
      
  return spawnSync(spawnCommand, spawnArgs, {
    cwd: process.cwd(),
    env: process.env,
    encoding: 'utf8',
    stdio: options.capture ? 'pipe' : 'inherit',
  });
}

function assertSuccess(result, label) {
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${label} failed with exit code ${result.status ?? 'unknown'}`);
  }
}

function isReachabilityError(output) {
  return REACHABILITY_ERROR_CODES.some((code) => output.includes(code));
}

function warnAndAllowUnreachable(output) {
  if (!ALLOW_UNREACHABLE || !isReachabilityError(output)) {
    return false;
  }
  console.warn('Prisma migration database is unreachable. Continuing startup because ALLOW_UNREACHABLE_MIGRATIONS=true.');
  console.warn('Fix DIRECT_URL/DIRECT_DATABASE_URL or run migrations from an authorized network node.');
  return true;
}

async function getExistingTables(databaseUrl) {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    const result = await client.query(
      `
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = $1
          AND table_type = 'BASE TABLE'
      `,
      [SCHEMA_NAME],
    );
    return new Set(result.rows.map((row) => row.table_name));
  } finally {
    await client.end();
  }
}

function getMigrationsToBaseline(existingTables) {
  const migrations = [];
  for (const migration of BASELINE_MIGRATIONS) {
    const allTablesExist = migration.tables.every((table) => existingTables.has(table));
    
    // ✅ Robust fix: Check all elements continuously instead of completely halting mid-chain
    if (allTablesExist) {
      migrations.push(migration.name);
    }
  }
  return migrations;
}

async function baselineExistingDatabase() {
  const existingTables = await getExistingTables(getDatabaseUrl());
  const migrations = getMigrationsToBaseline(existingTables);

  if (migrations.length === 0) {
    throw new Error(
      `Prisma reported a non-empty schema, but no known baseline tables were found in schema "${SCHEMA_NAME}". Refusing to guess a baseline.`,
    );
  }

  console.log(`Baselining schema "${SCHEMA_NAME}" with ${migrations.length} verified historic migration(s).`);

  for (const migration of migrations) {
    console.log(`Marking migration as applied: ${migration}`);
    assertSuccess(
      runPrisma(['migrate', 'resolve', '--applied', migration]),
      `prisma migrate resolve --applied ${migration}`,
    );
  }
}

async function main() {
  console.log('Initiating database deployment check cycle...');
  const firstDeploy = runPrisma(['migrate', 'deploy'], { capture: true });

  if (firstDeploy.error) throw firstDeploy.error;
  const output = `${firstDeploy.stdout ?? ''}${firstDeploy.stderr ?? ''}`;

  if (firstDeploy.status === 0) {
    process.stdout.write(firstDeploy.stdout ?? '');
    process.stderr.write(firstDeploy.stderr ?? '');
    console.log('Database schema successfully checked and synchronized.');
    return;
  }

  // Handle errors that are NOT schema-existing target mismatches (P3005)
  if (!output.includes('P3005')) {
    process.stdout.write(firstDeploy.stdout ?? '');
    process.stderr.write(firstDeploy.stderr ?? '');
    if (warnAndAllowUnreachable(output)) {
      return;
    }
    process.exit(firstDeploy.status ?? 1);
  }

  // Handle active structural P3005 baselining scenario safely
  console.warn('Prisma found a non-empty target database without migration history metadata. Initiating automatic baseline handler.');
  
  await baselineExistingDatabase();
  
  console.log('Executing final catch-up migration deployment...');
  assertSuccess(runPrisma(['migrate', 'deploy']), 'prisma migrate deploy');
}

main().catch((error) => {
  console.error('Fatal Migration Failure:', error instanceof Error ? error.message : error);
  process.exit(1);
});
