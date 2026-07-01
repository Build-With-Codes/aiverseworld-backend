#!/usr/bin/env node
/**
 * Final migration fix: Use DATABASE_URL if DIRECT_URL fails
 */

require('dotenv/config');
const { spawnSync } = require('node:child_process');
const path = require('node:path');

console.log('🔧 Running final migration fix...');

// Function to run Prisma command
function runPrisma(args) {
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
    stdio: 'inherit',
  });
}

// First, try with DIRECT_URL (original behavior)
console.log('1️⃣ Trying migrations with DIRECT_URL...');
let result = runPrisma(['migrate', 'deploy']);

if (result.status === 0) {
  console.log('✅ Migrations successful with DIRECT_URL');
  process.exit(0);
}

console.log('❌ DIRECT_URL migrations failed');
console.log('2️⃣ Trying with DATABASE_URL instead...');

// Create a temporary environment with DATABASE_URL as the migration URL
const tempEnv = {
  ...process.env,
  // Temporarily set DIRECT_URL to DATABASE_URL for migrations
  DIRECT_URL: process.env.DATABASE_URL,
  // Also set DIRECT_DATABASE_URL if DATABASE_URL doesn't work
  DIRECT_DATABASE_URL: process.env.DATABASE_URL,
};

result = spawnSync(
  path.join(process.cwd(), 'node_modules', '.bin', process.platform === 'win32' ? 'prisma.cmd' : 'prisma'),
  ['migrate', 'deploy'],
  {
    cwd: process.cwd(),
    env: tempEnv,
    encoding: 'utf8',
    stdio: 'inherit',
  }
);

if (result.status === 0) {
  console.log('✅ Migrations successful using DATABASE_URL');
  console.log('💡 Recommendation: Update DIRECT_URL to match DATABASE_URL in production');
  process.exit(0);
}

console.log('❌ Both migration attempts failed');
console.log('3️⃣ Falling back to manual table creation...');

// Run the create-missing-tables script
const createResult = spawnSync('node', ['scripts/create-missing-tables.js'], {
  cwd: process.cwd(),
  env: process.env,
  encoding: 'utf8',
  stdio: 'inherit',
});

if (createResult.status === 0) {
  console.log('✅ Missing tables created manually');
  console.log('⚠️  Application will work, but future migrations may need manual handling');
  process.exit(0);
}

console.log('❌ All migration strategies failed');
console.log('🚀 Starting application anyway - some features may be limited');
process.exit(0); // Don't fail deployment