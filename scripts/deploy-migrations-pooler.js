#!/usr/bin/env node
/**
 * Migration script optimized for Supabase connection pooler
 * Handles pooler limitations and provides better error messages
 */

require('dotenv/config');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const { Client } = require('pg');

const SCHEMA_NAME = 'aiverse_world';

console.log('🔧 Starting migrations with pooler optimization...');
console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
console.log(`🌐 Using: DATABASE_URL`);

// Check connection type
function checkConnectionType(connectionString) {
  if (!connectionString) return 'unknown';
  
  if (connectionString.includes(':6543/')) {
    return 'pooler';
  } else if (connectionString.includes(':5432/')) {
    return 'direct';
  } else {
    return 'unknown';
  }
}

function getDatabaseUrl() {
  const raw = process.env.DATABASE_URL;
  if (!raw) {
    throw new Error('DATABASE_URL not found in environment variables.');
  }
  
  const connType = checkConnectionType(raw);
  console.log(`🔌 Connection type: ${connType}`);
  
  if (connType === 'pooler') {
    console.log('✅ Using connection pooler for migrations');
  } else if (connType === 'direct') {
    console.log('⚠️  Using direct connection for migrations (may fail in cloud)');
  }
  
  return withSchema(raw);
}

function withSchema(raw) {
  if (!raw) return raw;
  try {
    const url = new URL(raw);
    url.searchParams.set('schema', SCHEMA_NAME);
    return url.toString();
  } catch {
    return raw;
  }
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

async function testConnection() {
  const databaseUrl = getDatabaseUrl();
  const client = new Client({ connectionString: databaseUrl });
  
  try {
    console.log('🔍 Testing database connection...');
    await client.connect();
    
    const result = await client.query(`
      SELECT 
        current_database() as db,
        current_schema() as schema,
        version() as version,
        (SELECT setting FROM pg_settings WHERE name = 'shared_preload_libraries') as preloaded_libs
    `);
    
    const info = result.rows[0];
    console.log(`✅ Connected to: ${info.db} (schema: ${info.schema})`);
    console.log(`📋 PostgreSQL: ${info.version.split(',')[0]}`);
    
    if (info.preloaded_libraries && info.preloaded_libraries.includes('pgbouncer')) {
      console.log('⚠️  Detected PgBouncer (connection pooler)');
      console.log('   Ensure it is running in SESSION mode for migrations');
    }
    
    await client.end();
    return true;
  } catch (error) {
    console.error(`❌ Connection test failed: ${error.message}`);
    
    if (error.message.includes('P1001') || error.message.includes('timeout')) {
      console.log('\n🔧 Troubleshooting tips:');
      console.log('1. For Supabase: Use connection pooler (port 6543) instead of direct (5432)');
      console.log('2. Check IP whitelisting in Supabase dashboard');
      console.log('3. Verify database credentials');
      console.log('4. Ensure database is running and accessible');
    }
    
    await client.end().catch(() => {});
    return false;
  }
}

async function checkExistingTables() {
  const databaseUrl = getDatabaseUrl();
  const client = new Client({ connectionString: databaseUrl });
  
  try {
    await client.connect();
    
    // First ensure schema exists
    await client.query(`CREATE SCHEMA IF NOT EXISTS "${SCHEMA_NAME}"`);
    
    // Check existing tables
    const result = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = $1
        AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `, [SCHEMA_NAME]);
    
    const tables = result.rows.map(row => row.table_name);
    
    console.log(`📊 Found ${tables.length} existing tables in schema "${SCHEMA_NAME}":`);
    if (tables.length > 0) {
      tables.forEach(table => console.log(`   - ${table}`));
    }
    
    await client.end();
    return new Set(tables);
  } catch (error) {
    console.error(`❌ Error checking tables: ${error.message}`);
    await client.end().catch(() => {});
    return new Set();
  }
}

async function createMissingTables(existingTables) {
  const missingTables = [
    'Problem',
    'AiToolSource', 
    'AiTool',
    'AiToolEmbedding'
  ].filter(table => !existingTables.has(table));
  
  if (missingTables.length === 0) {
    console.log('✅ All required tables already exist');
    return true;
  }
  
  console.log(`🔧 Need to create ${missingTables.length} missing tables: ${missingTables.join(', ')}`);
  
  // Try to run prisma migrate deploy
  console.log('🚀 Running Prisma migrations...');
  const result = runPrisma(['migrate', 'deploy'], { capture: true });
  
  if (result.status === 0) {
    console.log('✅ Prisma migrations completed successfully');
    return true;
  }
  
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
  console.error(`❌ Prisma migrate deploy failed: ${output.substring(0, 500)}`);
  
  // If P3005 error (schema exists without migration history), try baseline
  if (output.includes('P3005')) {
    console.log('🔄 Attempting to baseline existing schema...');
    const baselineResult = runPrisma(['migrate', 'resolve', '--applied', '20260606150000_init']);
    
    if (baselineResult.status === 0) {
      console.log('✅ Baseline successful, trying migrations again...');
      const retryResult = runPrisma(['migrate', 'deploy']);
      return retryResult.status === 0;
    }
  }
  
  return false;
}

async function main() {
  console.log('🚀 Starting database migration deployment...\n');
  
  // Test connection first
  const canConnect = await testConnection();
  if (!canConnect) {
    console.error('❌ Cannot proceed without database connection');
    process.exit(1);
  }
  
  console.log('\n📋 Checking existing database state...');
  const existingTables = await checkExistingTables();
  
  console.log('\n🛠️  Deploying migrations...');
  const success = await createMissingTables(existingTables);
  
  if (success) {
    console.log('\n🎉 Database migrations completed successfully!');
    process.exit(0);
  } else {
    console.log('\n⚠️  Migrations partially completed or failed');
    console.log('   Application may start with limited functionality');
    console.log('   Check logs above for specific errors');
    process.exit(0); // Don't fail deployment, let app start
  }
}

main().catch(error => {
  console.error('❌ Fatal migration error:', error.message);
  process.exit(1);
});