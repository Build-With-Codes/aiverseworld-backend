#!/usr/bin/env node
/**
 * Test Supabase connection from Render environment
 */

require('dotenv/config');
const { Client } = require('pg');

console.log('🔌 Testing Supabase Connections from Render');
console.log('===========================================\n');

// Test direct connection (port 5432)
async function testDirectConnection() {
  const directUrl = process.env.DIRECT_URL;
  if (!directUrl) {
    console.log('❌ DIRECT_URL not set');
    return false;
  }
  
  console.log(`Testing DIRECT_URL: ${directUrl.replace(/:[^:]*?@/, ':****@')}`);
  
  const client = new Client({ connectionString: directUrl });
  
  try {
    await client.connect();
    const result = await client.query('SELECT 1 as test');
    console.log('✅ Direct connection (5432): SUCCESS');
    await client.end();
    return true;
  } catch (error) {
    console.log(`❌ Direct connection (5432): FAILED - ${error.message}`);
    await client.end().catch(() => {});
    return false;
  }
}

// Test pooler connection (port 6543)
async function testPoolerConnection() {
  // Try to create pooler URL from direct URL
  const directUrl = process.env.DIRECT_URL;
  if (!directUrl) {
    console.log('❌ Cannot test pooler - no DIRECT_URL');
    return false;
  }
  
  // Convert port 5432 to 6543
  let poolerUrl = directUrl.replace(':5432/', ':6543/');
  
  // If no port specified, add pooler port
  if (!directUrl.includes(':5432') && !directUrl.includes(':6543')) {
    poolerUrl = directUrl.replace('supabase.co/', 'supabase.co:6543/');
  }
  
  console.log(`Testing pooler URL: ${poolerUrl.replace(/:[^:]*?@/, ':****@')}`);
  
  const client = new Client({ connectionString: poolerUrl });
  
  try {
    await client.connect();
    const result = await client.query('SELECT 1 as test');
    console.log('✅ Pooler connection (6543): SUCCESS');
    await client.end();
    return true;
  } catch (error) {
    console.log(`❌ Pooler connection (6543): FAILED - ${error.message}`);
    await client.end().catch(() => {});
    return false;
  }
}

// Test DATABASE_URL connection
async function testRuntimeConnection() {
  const runtimeUrl = process.env.DATABASE_URL;
  if (!runtimeUrl) {
    console.log('❌ DATABASE_URL not set');
    return false;
  }
  
  console.log(`Testing DATABASE_URL: ${runtimeUrl.replace(/:[^:]*?@/, ':****@')}`);
  
  const client = new Client({ connectionString: runtimeUrl });
  
  try {
    await client.connect();
    const result = await client.query('SELECT 1 as test');
    console.log('✅ Runtime connection: SUCCESS');
    await client.end();
    return true;
  } catch (error) {
    console.log(`❌ Runtime connection: FAILED - ${error.message}`);
    await client.end().catch(() => {});
    return false;
  }
}

async function main() {
  console.log('🧪 Running connection tests...\n');
  
  const directSuccess = await testDirectConnection();
  console.log('');
  
  const poolerSuccess = await testPoolerConnection();
  console.log('');
  
  const runtimeSuccess = await testRuntimeConnection();
  console.log('');
  
  console.log('📋 Summary:');
  console.log('-----------');
  console.log(`Direct connection (5432): ${directSuccess ? '✅ SUCCESS' : '❌ FAILED'}`);
  console.log(`Pooler connection (6543): ${poolerSuccess ? '✅ SUCCESS' : '❌ FAILED'}`);
  console.log(`Runtime connection: ${runtimeSuccess ? '✅ SUCCESS' : '❌ FAILED'}`);
  console.log('');
  
  if (!directSuccess && poolerSuccess) {
    console.log('🔧 Recommendation:');
    console.log('Change DIRECT_URL to use pooler (port 6543) instead of direct (port 5432)');
    console.log('');
    console.log('Current DIRECT_URL:', process.env.DIRECT_URL?.replace(/:[^:]*?@/, ':****@'));
    console.log('Suggested fix:');
    
    if (process.env.DIRECT_URL) {
      const fixedUrl = process.env.DIRECT_URL
        .replace(':5432/', ':6543/')
        .replace('supabase.co/', 'supabase.co:6543/');
      console.log('DIRECT_URL=', fixedUrl.replace(/:[^:]*?@/, ':****@'));
    }
  } else if (!directSuccess && !poolerSuccess) {
    console.log('❌ Both connections failed. Check:');
    console.log('1. Database credentials');
    console.log('2. IP whitelisting in Supabase');
    console.log('3. Network connectivity from Render');
  }
  
  process.exit(0);
}

main().catch(error => {
  console.error('Test failed:', error.message);
  process.exit(1);
});