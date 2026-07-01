#!/usr/bin/env node
/**
 * Script to fix missing tables by running specific migrations
 */

require('dotenv/config');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const { Client } = require('pg');

const SCHEMA_NAME = 'aiverse_world';

function withSchema(raw) {
  if (!raw) return raw;
  const url = new URL(raw);
  url.searchParams.set('schema', SCHEMA_NAME);
  return url.toString();
}

function getDatabaseUrl() {
  const raw = process.env.DIRECT_URL ?? process.env.DIRECT_DATABASE_URL;
  if (!raw) {
    throw new Error('DIRECT_URL or DIRECT_DATABASE_URL is required.');
  }
  return withSchema(raw);
}

async function getExistingTables() {
  const client = new Client({ connectionString: getDatabaseUrl() });
  await client.connect();
  try {
    const result = await client.query(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = $1 AND table_type = 'BASE TABLE'`,
      [SCHEMA_NAME]
    );
    return new Set(result.rows.map(row => row.table_name));
  } finally {
    await client.end();
  }
}

function runPrismaMigration(migrationName) {
  console.log(`🚀 Running migration: ${migrationName}`);
  const command = path.join(process.cwd(), 'node_modules', '.bin', 'prisma.cmd');
  
  const result = spawnSync('cmd.exe', ['/d', '/c', `call "${command}" migrate deploy --name ${migrationName}`], {
    cwd: process.cwd(),
    env: process.env,
    stdio: 'inherit',
    encoding: 'utf8'
  });
  
  if (result.status !== 0) {
    console.error(`❌ Migration ${migrationName} failed with code: ${result.status}`);
    return false;
  }
  
  console.log(`✅ Migration ${migrationName} completed successfully`);
  return true;
}

async function main() {
  console.log('🔍 Checking existing tables...');
  const existingTables = await getExistingTables();
  
  console.log('📊 Existing tables:', Array.from(existingTables).sort());
  
  // Define which tables should exist from each migration
  const expectedTables = {
    '20260629110000_problem_catalog': ['Problem'],
    '20260629120000_ai_tool_catalog': ['AiToolSource', 'AiTool'],
    '20260629130000_ai_tool_vector_index': ['AiToolEmbedding']
  };
  
  console.log('\n🔎 Checking for missing tables...');
  
  let allTablesExist = true;
  
  // Check each migration's tables
  for (const [migration, tables] of Object.entries(expectedTables)) {
    const missingTables = tables.filter(table => !existingTables.has(table));
    
    if (missingTables.length > 0) {
      console.log(`❌ Migration ${migration} missing tables: ${missingTables.join(', ')}`);
      allTablesExist = false;
      
      // Try to run this migration
      console.log(`\n🛠️  Attempting to create missing tables for ${migration}...`);
      const success = runPrismaMigration(migration);
      
      if (success) {
        // Update existing tables after migration
        const updatedTables = await getExistingTables();
        const stillMissing = tables.filter(table => !updatedTables.has(table));
        
        if (stillMissing.length === 0) {
          console.log(`✅ All tables for ${migration} now exist`);
        } else {
          console.log(`❌ Still missing after migration: ${stillMissing.join(', ')}`);
        }
      }
    } else {
      console.log(`✅ Migration ${migration} tables all exist`);
    }
  }
  
  if (allTablesExist) {
    console.log('\n🎉 All tables exist! Database schema is complete.');
  } else {
    console.log('\n⚠️  Some tables are still missing. You may need to:');
    console.log('   1. Check database connection');
    console.log('   2. Verify user permissions');
    console.log('   3. Run migrations manually: npm run prisma:migrate:dev');
  }
}

main().catch(error => {
  console.error('❌ Error:', error.message);
  process.exit(1);
});