#!/usr/bin/env node
/**
 * Check if both connections are configured correctly
 */

require('dotenv/config');

console.log('🔧 Checking Supabase Connection Configuration');
console.log('=============================================\n');

// Check DATABASE_URL (runtime - should be 6543)
console.log('📋 DATABASE_URL (Runtime - should use port 6543):');
if (process.env.DATABASE_URL) {
  const url = process.env.DATABASE_URL;
  const masked = url.replace(/:[^:]*?@/, ':****@');
  console.log(`   ${masked}`);
  
  if (url.includes(':6543')) {
    console.log('   ✅ Correct: Using Transaction Mode pooler (6543)');
  } else if (url.includes(':5432')) {
    console.log('   ⚠️  Warning: Using port 5432 for runtime (may be Session Mode)');
  } else {
    console.log('   ❓ Unknown port');
  }
} else {
  console.log('   ❌ NOT SET');
}

console.log('\n📋 DIRECT_URL (Migrations - should use port 5432):');
if (process.env.DIRECT_URL) {
  const url = process.env.DIRECT_URL;
  const masked = url.replace(/:[^:]*?@/, ':****@');
  console.log(`   ${masked}`);
  
  if (url.includes(':5432')) {
    console.log('   ✅ Correct: Using Session Mode pooler (5432)');
  } else if (url.includes(':6543')) {
    console.log('   ❌ Problem: Using Transaction Mode (6543) for migrations');
    console.log('      Transaction Mode does not support Prisma migrations');
  } else {
    console.log('   ❓ Unknown port');
  }
} else {
  console.log('   ⚠️  NOT SET (will use DATABASE_URL for migrations)');
}

console.log('\n🔍 Configuration Analysis:');
console.log('=========================');

const dbUrl = process.env.DATABASE_URL;
const directUrl = process.env.DIRECT_URL;

if (!dbUrl) {
  console.log('❌ DATABASE_URL is required');
  process.exit(1);
}

if (dbUrl && directUrl) {
  if (dbUrl.includes(':6543') && directUrl.includes(':5432')) {
    console.log('✅ Perfect Configuration:');
    console.log('   - Runtime: Transaction Mode (6543) ✅');
    console.log('   - Migrations: Session Mode (5432) ✅');
    console.log('\n💡 This is the recommended setup for Supabase + Prisma + Render');
  } else if (dbUrl === directUrl) {
    console.log('⚠️  Same connection for both:');
    console.log('   If using port 6543: Migrations may fail');
    console.log('   If using port 5432: Runtime may be less efficient');
  }
} else if (dbUrl && !directUrl) {
  console.log('⚠️  Using same connection for runtime and migrations:');
  if (dbUrl.includes(':6543')) {
    console.log('   ❌ Problem: Using Transaction Mode (6543) for migrations');
    console.log('      Migrations will likely fail');
  } else if (dbUrl.includes(':5432')) {
    console.log('   ⚠️  Using Session Mode (5432) for everything');
    console.log('      Runtime may be less efficient but migrations will work');
  }
}

console.log('\n📋 Recommended Environment Variables for Render:');
console.log('===============================================');
console.log('DATABASE_URL=postgresql://postgres.maemusryvekzmrfispra:[PASSWORD]@aws-1-ap-south-1.pooler.supabase.com:6543/postgres?schema=aiverse_world');
console.log('DIRECT_URL=postgresql://postgres.maemusryvekzmrfispra:[PASSWORD]@aws-1-ap-south-1.pooler.supabase.com:5432/postgres?schema=aiverse_world');