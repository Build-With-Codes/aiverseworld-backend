#!/usr/bin/env node

require('dotenv/config');

const { spawnSync } = require('node:child_process');
const path = require('node:path');

console.log('=== Ensuring database migrations are applied ===');

const prismaPath = path.join(__dirname, 'node_modules', '.bin', 'prisma.cmd');

// First, check migration status
console.log('\nChecking migration status...');
const statusResult = spawnSync(prismaPath, ['migrate', 'status'], {
  stdio: 'pipe',
  cwd: __dirname,
  shell: true,
  encoding: 'utf8'
});

const output = statusResult.stdout + statusResult.stderr;

if (statusResult.status === 0 && output.includes('Database schema is up to date')) {
  console.log('✓ Database schema is already up to date');
} else {
  console.log('Applying migrations...');
  
  // Try regular deploy
  const deployResult = spawnSync(prismaPath, ['migrate', 'deploy'], {
    stdio: 'inherit',
    cwd: __dirname,
    shell: true
  });

  if (deployResult.status !== 0) {
    console.log('\nRegular deploy failed, trying with --allow-unreachable...');
    
    const deployAllowResult = spawnSync(prismaPath, ['migrate', 'deploy', '--allow-unreachable'], {
      stdio: 'inherit',
      cwd: __dirname,
      shell: true
    });

    if (deployAllowResult.status !== 0) {
      console.error('\n❌ Failed to apply migrations');
      process.exit(1);
    }
  }
  
  console.log('\n✓ Migrations applied successfully');
}

console.log('\n=== Migrations check complete ===');