require('dotenv/config');

const { spawnSync } = require('node:child_process');
const path = require('node:path');
const { Client } = require('pg');

const SCHEMA_NAME = 'aiverse_world';
const ALLOW_UNREACHABLE = process.argv.includes('--allow-unreachable');
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
  if (!raw) {
    return raw;
  }

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
  const result = spawnSync(spawnCommand, spawnArgs, {
    cwd: process.cwd(),
    env: process.env,
    encoding: 'utf8',
    stdio: options.capture ? 'pipe' : 'inherit',
  });

  return result;
}

function assertSuccess(result, label) {
  if (result.error) {
    throw result.error;
  }

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

  console.warn(
    'Prisma migration database is unreachable. Continuing startup so the web service can bind its port.',
  );
  console.warn(
    'Fix DIRECT_URL/DIRECT_DATABASE_URL or run `npm run prisma:migrate` from a network that can reach Postgres so required tables are created.',
  );
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

    if (!allTablesExist) {
      break;
    }

    migrations.push(migration.name);
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

  console.log(
    `Baselining existing schema "${SCHEMA_NAME}" with ${migrations.length} applied Prisma migration(s).`,
  );

  for (const migration of migrations) {
    console.log(`Marking migration as applied: ${migration}`);
    assertSuccess(
      runPrisma(['migrate', 'resolve', '--applied', migration]),
      `prisma migrate resolve --applied ${migration}`,
    );
  }
}

async function main() {
  const firstDeploy = runPrisma(['migrate', 'deploy'], { capture: true });

  if (firstDeploy.error) {
    throw firstDeploy.error;
  }

  const output = `${firstDeploy.stdout ?? ''}${firstDeploy.stderr ?? ''}`;

  if (firstDeploy.status === 0) {
    process.stdout.write(firstDeploy.stdout ?? '');
    process.stderr.write(firstDeploy.stderr ?? '');
    return;
  }

  if (!output.includes('P3005')) {
    process.stdout.write(firstDeploy.stdout ?? '');
    process.stderr.write(firstDeploy.stderr ?? '');
    if (warnAndAllowUnreachable(output)) {
      return;
    }
    process.exit(firstDeploy.status ?? 1);
  }

  process.stdout.write(firstDeploy.stdout ?? '');
  process.stderr.write(firstDeploy.stderr ?? '');
  console.warn('Prisma found a non-empty schema without migration history. Starting baseline.');

  await baselineExistingDatabase();
  assertSuccess(runPrisma(['migrate', 'deploy']), 'prisma migrate deploy');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
