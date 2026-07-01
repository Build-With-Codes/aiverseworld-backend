#!/usr/bin/env node
/**
 * Script to manually create missing tables using the working runtime connection
 */

require('dotenv/config');
const { Client } = require('pg');
const url = require('url');

const SCHEMA_NAME = 'aiverse_world';

console.log('🔧 Creating missing tables manually...');

// Get the working DATABASE_URL (runtime connection)
function getDatabaseUrl() {
  const raw = process.env.DATABASE_URL;
  if (!raw) {
    throw new Error('DATABASE_URL is not set');
  }
  
  // Add schema parameter if not present
  try {
    const parsed = new URL(raw);
    parsed.searchParams.set('schema', SCHEMA_NAME);
    return parsed.toString();
  } catch {
    return raw;
  }
}

// SQL to create missing tables (from migration files)
const CREATE_TABLES_SQL = [
  // Problem table
  `
  CREATE TABLE IF NOT EXISTS "${SCHEMA_NAME}"."Problem" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "industry" TEXT NOT NULL,
    "frequency" TEXT NOT NULL,
    "painScore" INTEGER NOT NULL,
    "email" TEXT,
    "aiSolvable" INTEGER NOT NULL DEFAULT 0,
    "notAiSolvable" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Problem_pkey" PRIMARY KEY ("id")
  );
  CREATE INDEX IF NOT EXISTS "Problem_createdAt_idx" ON "${SCHEMA_NAME}"."Problem"("createdAt" DESC);
  CREATE INDEX IF NOT EXISTS "Problem_industry_idx" ON "${SCHEMA_NAME}"."Problem"("industry");
  CREATE INDEX IF NOT EXISTS "Problem_painScore_idx" ON "${SCHEMA_NAME}"."Problem"("painScore");
  `,
  
  // AiToolSource table
  `
  CREATE TABLE IF NOT EXISTS "${SCHEMA_NAME}"."AiToolSource" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "baseUrl" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AiToolSource_pkey" PRIMARY KEY ("id")
  );
  CREATE UNIQUE INDEX IF NOT EXISTS "AiToolSource_name_key" ON "${SCHEMA_NAME}"."AiToolSource"("name");
  `,
  
  // AiTool table
  `
  CREATE TABLE IF NOT EXISTS "${SCHEMA_NAME}"."AiTool" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT,
    "rank" INTEGER,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "subcategory" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "website" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "favicon" TEXT NOT NULL,
    "logoUrl" TEXT,
    "freePlan" TEXT NOT NULL,
    "freeTrial" BOOLEAN NOT NULL DEFAULT false,
    "pricingModel" TEXT NOT NULL,
    "startingPriceUsd" DOUBLE PRECISION,
    "pricingNotes" TEXT,
    "shortDescription" TEXT NOT NULL,
    "summary" TEXT,
    "features" JSONB NOT NULL,
    "bestFor" JSONB NOT NULL,
    "targetAudience" JSONB NOT NULL,
    "tags" JSONB NOT NULL,
    "aiType" JSONB NOT NULL,
    "modalities" JSONB NOT NULL,
    "modelProvider" JSONB NOT NULL,
    "modelNames" JSONB,
    "apiAvailable" BOOLEAN NOT NULL DEFAULT false,
    "openSource" BOOLEAN NOT NULL DEFAULT false,
    "deploymentType" JSONB NOT NULL,
    "platforms" JSONB NOT NULL,
    "integrations" JSONB,
    "teamCollaboration" BOOLEAN,
    "security" JSONB,
    "privacyNotes" TEXT,
    "popularityScore" INTEGER,
    "rating" DOUBLE PRECISION,
    "reviewCount" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'Active',
    "launchYear" INTEGER,
    "lastVerified" TIMESTAMP(3),
    "sourceUrl" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "searchText" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AiTool_pkey" PRIMARY KEY ("id")
  );
  CREATE UNIQUE INDEX IF NOT EXISTS "AiTool_slug_key" ON "${SCHEMA_NAME}"."AiTool"("slug");
  CREATE INDEX IF NOT EXISTS "AiTool_category_idx" ON "${SCHEMA_NAME}"."AiTool"("category");
  CREATE INDEX IF NOT EXISTS "AiTool_pricingModel_idx" ON "${SCHEMA_NAME}"."AiTool"("pricingModel");
  CREATE INDEX IF NOT EXISTS "AiTool_popularityScore_idx" ON "${SCHEMA_NAME}"."AiTool"("popularityScore");
  CREATE INDEX IF NOT EXISTS "AiTool_rating_idx" ON "${SCHEMA_NAME}"."AiTool"("rating");
  CREATE INDEX IF NOT EXISTS "AiTool_updatedAt_idx" ON "${SCHEMA_NAME}"."AiTool"("updatedAt" DESC);
  
  ALTER TABLE "${SCHEMA_NAME}"."AiTool"
    ADD CONSTRAINT "AiTool_sourceId_fkey"
    FOREIGN KEY ("sourceId") REFERENCES "${SCHEMA_NAME}"."AiToolSource"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  `,
  
  // AiToolEmbedding table
  `
  CREATE TABLE IF NOT EXISTS "${SCHEMA_NAME}"."AiToolEmbedding" (
    "id" TEXT NOT NULL,
    "toolId" TEXT NOT NULL,
    "chunkIndex" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "embedding" JSONB NOT NULL,
    "embeddingModel" TEXT NOT NULL,
    "metadata" JSONB,
    "sourceUpdatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AiToolEmbedding_pkey" PRIMARY KEY ("id")
  );
  CREATE UNIQUE INDEX IF NOT EXISTS "AiToolEmbedding_toolId_chunkIndex_key"
    ON "${SCHEMA_NAME}"."AiToolEmbedding"("toolId", "chunkIndex");
  CREATE INDEX IF NOT EXISTS "AiToolEmbedding_toolId_idx"
    ON "${SCHEMA_NAME}"."AiToolEmbedding"("toolId");
  CREATE INDEX IF NOT EXISTS "AiToolEmbedding_contentHash_idx"
    ON "${SCHEMA_NAME}"."AiToolEmbedding"("contentHash");
  CREATE INDEX IF NOT EXISTS "AiToolEmbedding_updatedAt_idx"
    ON "${SCHEMA_NAME}"."AiToolEmbedding"("updatedAt" DESC);
  
  ALTER TABLE "${SCHEMA_NAME}"."AiToolEmbedding"
    ADD CONSTRAINT "AiToolEmbedding_toolId_fkey"
    FOREIGN KEY ("toolId") REFERENCES "${SCHEMA_NAME}"."AiTool"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  `
];

async function main() {
  const databaseUrl = getDatabaseUrl();
  console.log(`🔌 Using connection: ${databaseUrl.replace(/:[^:]*?@/, ':****@')}`);
  
  const client = new Client({ connectionString: databaseUrl });
  
  try {
    await client.connect();
    console.log('✅ Connected to database');
    
    // Ensure schema exists
    await client.query(`CREATE SCHEMA IF NOT EXISTS "${SCHEMA_NAME}"`);
    console.log(`✅ Schema "${SCHEMA_NAME}" ensured`);
    
    // Check which tables already exist
    const existingTablesResult = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = $1
    `, [SCHEMA_NAME]);
    
    const existingTables = new Set(existingTablesResult.rows.map(r => r.table_name));
    console.log(`📊 Found ${existingTables.size} existing tables in schema "${SCHEMA_NAME}"`);
    
    const tablesToCreate = ['Problem', 'AiToolSource', 'AiTool', 'AiToolEmbedding']
      .filter(table => !existingTables.has(table));
    
    if (tablesToCreate.length === 0) {
      console.log('✅ All tables already exist');
      await client.end();
      return;
    }
    
    console.log(`🔧 Creating ${tablesToCreate.length} missing tables: ${tablesToCreate.join(', ')}`);
    
    // Create tables in order (respecting foreign key dependencies)
    const creationOrder = ['AiToolSource', 'AiTool', 'AiToolEmbedding', 'Problem'];
    
    for (const tableName of creationOrder) {
      if (tablesToCreate.includes(tableName)) {
        console.log(`📝 Creating table: ${tableName}`);
        
        // Find the SQL for this table
        const tableSql = CREATE_TABLES_SQL.find(sql => 
          sql.includes(`"${SCHEMA_NAME}"."${tableName}"`)
        );
        
        if (tableSql) {
          try {
            await client.query(tableSql);
            console.log(`✅ Created table: ${tableName}`);
          } catch (error) {
            console.error(`❌ Error creating table ${tableName}:`, error.message);
          }
        }
      }
    }
    
    // Verify creation
    const verifyResult = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = $1
    `, [SCHEMA_NAME]);
    
    const finalTables = new Set(verifyResult.rows.map(r => r.table_name));
    const stillMissing = tablesToCreate.filter(table => !finalTables.has(table));
    
    if (stillMissing.length === 0) {
      console.log('🎉 All missing tables created successfully!');
    } else {
      console.log(`⚠️ Some tables still missing: ${stillMissing.join(', ')}`);
    }
    
    await client.end();
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    await client.end().catch(() => {});
    process.exit(1);
  }
}

main().catch(error => {
  console.error('❌ Fatal error:', error.message);
  process.exit(1);
});