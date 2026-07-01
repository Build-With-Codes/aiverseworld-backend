#!/usr/bin/env node
/**
 * Diagnostic script to check database connections and migration status
 */

require('dotenv/config');
const { Client } = require('pg');
const url = require('url');

console.log('🔍 Database Connection Diagnostics');
console.log('==================================\n');

// Check environment variables
console.log('📋 Environment Variables:');
console.log(`   DATABASE_URL: ${process.env.DATABASE_URL ? 'SET' : 'NOT SET'}`);
console.log(`   DIRECT_URL: ${process.env.DIRECT_URL ? 'SET' : 'NOT SET'}`);
console.log(`   DIRECT_DATABASE_URL: ${process.env.DIRECT_DATABASE_URL ? 'SET' : 'NOT SET'}`);
console.log(`   NODE_ENV: ${process.env.NODE_ENV || 'not set'}`);
console.log(`   RENDER: ${process.env.RENDER || 'not set'}`);

// Parse URLs to understand connection types
function parseConnectionInfo(connectionString) {
  if (!connectionString) return null;
  
  try {
    const parsed = new URL(connectionString);
    return {
      protocol: parsed.protocol,
      hostname: parsed.hostname,
      port: parsed.port || '5432 (default)',
      username: parsed.username,
      database: parsed.pathname.replace('/', ''),
      isPooler: parsed.hostname.includes('pooler') || parsed.port === '6543',
      isDirect: !parsed.hostname.includes('pooler') && (parsed.port === '5432' || !parsed.port)
    };
  } catch (error) {
    return { error: error.message, raw: connectionString.substring(0, 50) + '...' };
  }
}

console.log('\n🔌 Connection Analysis:');
console.log('----------------------');

const dbUrlInfo = parseConnectionInfo(process.env.DATABASE_URL);
const directUrlInfo = parseConnectionInfo(process.env.DIRECT_URL);

console.log('\nDATABASE_URL (Runtime):');
if (dbUrlInfo) {
  console.log(`   Host: ${dbUrlInfo.hostname}:${dbUrlInfo.port}`);
  console.log(`   User: ${dbUrlInfo.username}`);
  console.log(`   DB: ${dbUrlInfo.database}`);
  console.log(`   Type: ${dbUrlInfo.isPooler ? 'POOLED (connection pooler)' : dbUrlInfo.isDirect ? 'DIRECT' : 'UNKNOWN'}`);
} else {
  console.log('   Not set or invalid');
}

console.log('\nDIRECT_URL (Migrations):');
if (directUrlInfo) {
  console.log(`   Host: ${directUrlInfo.hostname}:${directUrlInfo.port}`);
  console.log(`   User: ${directUrlInfo.username}`);
  console.log(`   DB: ${directUrlInfo.database}`);
  console.log(`   Type: ${directUrlInfo.isPooler ? 'POOLED (WRONG for migrations!)' : directUrlInfo.isDirect ? 'DIRECT (correct)' : 'UNKNOWN'}`);
  
  // Check if URLs are the same
  if (process.env.DATABASE_URL === process.env.DIRECT_URL) {
    console.log('   ⚠️  WARNING: DATABASE_URL and DIRECT_URL are IDENTICAL!');
    console.log('      Migrations should use a different (direct) connection.');
  }
} else {
  console.log('   Not set or invalid');
}

// Test connections
async function testConnection(connectionString, label) {
  if (!connectionString) {
    console.log(`\n❌ ${label}: No connection string`);
    return false;
  }
  
  const client = new Client({ connectionString });
  
  try {
    await client.connect();
    
    // Get connection info
    const result = await client.query(`
      SELECT 
        current_database() as db,
        current_schema() as schema,
        inet_server_addr()::text as host,
        inet_server_port() as port,
        version() as version,
        (SELECT setting FROM pg_settings WHERE name = 'shared_preload_libraries') as shared_preload_libraries
    `);
    
    const info = result.rows[0];
    
    console.log(`\n✅ ${label}: Connected successfully`);
    console.log(`   Database: ${info.db}`);
    console.log(`   Schema: ${info.schema}`);
    console.log(`   Server: ${info.host}:${info.port}`);
    console.log(`   PostgreSQL: ${info.version.split(',')[0]}`);
    console.log(`   Preloaded libs: ${info.shared_preload_libraries || 'none'}`);
    
    // Check if this looks like a pooler
    const isLikelyPooler = info.shared_preload_libraries && 
      (info.shared_preload_libraries.includes('pgbouncer') || 
       info.shared_preload_libraries.includes('pooler'));
    
    if (isLikelyPooler) {
      console.log(`   ⚠️  This appears to be a CONNECTION POOLER (not suitable for migrations)`);
    }
    
    await client.end();
    return true;
    
  } catch (error) {
    console.log(`\n❌ ${label}: Connection failed`);
    console.log(`   Error: ${error.message}`);
    await client.end().catch(() => {});
    return false;
  }
}

async function checkTables(connectionString) {
  if (!connectionString) return;
  
  const client = new Client({ connectionString });
  
  try {
    await client.connect();
    
    // Check schema exists
    const schemaResult = await client.query(`
      SELECT schema_name 
      FROM information_schema.schemata 
      WHERE schema_name = 'aiverse_world'
    `);
    
    if (schemaResult.rows.length === 0) {
      console.log('   Schema "aiverse_world": NOT FOUND');
      await client.end();
      return;
    }
    
    console.log('   Schema "aiverse_world": EXISTS');
    
    // Check tables
    const tablesResult = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'aiverse_world' 
      ORDER BY table_name
    `);
    
    const tables = tablesResult.rows.map(row => row.table_name);
    
    console.log(`   Tables found (${tables.length}):`);
    if (tables.length > 0) {
      tables.forEach(table => console.log(`     - ${table}`));
    }
    
    // Expected tables
    const expectedTables = [
      'NewsPipelineRun',
      'NewsSource', 'RawArticle', 'AiArticle',
      'EnglishTutorSession', 'EnglishTutorTurn', 'EnglishTutorMistake',
      'Problem',
      'AiToolSource', 'AiTool', 'AiToolEmbedding'
    ];
    
    const missingTables = expectedTables.filter(table => !tables.includes(table));
    
    if (missingTables.length > 0) {
      console.log(`\n   ❌ Missing tables (${missingTables.length}):`);
      missingTables.forEach(table => console.log(`     - ${table}`));
    } else {
      console.log(`\n   ✅ All expected tables exist`);
    }
    
    await client.end();
    
  } catch (error) {
    console.log(`   Error checking tables: ${error.message}`);
    await client.end().catch(() => {});
  }
}

async function main() {
  console.log('\n🧪 Connection Tests:');
  console.log('-------------------');
  
  // Test DATABASE_URL connection
  await testConnection(process.env.DATABASE_URL, 'DATABASE_URL (Runtime)');
  
  // Test DIRECT_URL connection (or DATABASE_URL if DIRECT not set)
  const migrationUrl = process.env.DIRECT_URL || process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL;
  await testConnection(migrationUrl, 'Migration Connection');
  
  console.log('\n📊 Database Schema Check:');
  console.log('------------------------');
  
  await checkTables(migrationUrl);
  
  console.log('\n🔧 Recommendations:');
  console.log('------------------');
  
  if (!process.env.DIRECT_URL && !process.env.DIRECT_DATABASE_URL) {
    console.log('1. ⚠️  Set DIRECT_URL environment variable for migrations');
    console.log('   Migrations need a direct database connection (not pooled)');
  }
  
  if (process.env.DATABASE_URL === process.env.DIRECT_URL) {
    console.log('2. ⚠️  Use different connections for DATABASE_URL and DIRECT_URL');
    console.log('   Example for Supabase:');
    console.log('     DATABASE_URL=postgresql://...pooler.supabase.com:6543/...');
    console.log('     DIRECT_URL=postgresql://...supabase.com:5432/...');
  }
  
  const migrationInfo = parseConnectionInfo(migrationUrl);
  if (migrationInfo && migrationInfo.isPooler) {
    console.log('3. ❌ MIGRATIONS ARE USING POOLED CONNECTION!');
    console.log('   This will cause migration failures.');
    console.log('   Set DIRECT_URL to a direct database connection.');
  }
  
  console.log('\n✅ Diagnostic complete');
}

main().catch(error => {
  console.error('❌ Diagnostic failed:', error.message);
  process.exit(1);
});