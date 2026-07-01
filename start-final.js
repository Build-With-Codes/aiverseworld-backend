#!/usr/bin/env node
/**
 * Final production startup script with correct Supabase pooler configuration
 * Uses Session Mode (5432) for migrations, falls back to manual table creation
 */

require('dotenv/config');
const http = require('http');
const { spawn, spawnSync } = require('node:child_process');
const path = require('path');

console.log('🚀 Starting AiverseWorld Backend (Final Configuration)');
console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
console.log(`🔌 PORT from env: ${process.env.PORT || '3001 (default)'}`);
console.log(`🌐 RENDER environment: ${process.env.RENDER || 'not set'}`);

// Display database connection info (masked)
if (process.env.DATABASE_URL) {
  const maskedUrl = process.env.DATABASE_URL.replace(/:[^:]*?@/, ':****@');
  console.log(`🔗 DATABASE_URL (Runtime): ${maskedUrl}`);
  
  // Check connection type
  if (maskedUrl.includes(':6543')) {
    console.log('   ✅ Correct: Transaction Mode pooler (6543) for runtime');
  } else if (maskedUrl.includes(':5432')) {
    console.log('   ⚠️  Using Session Mode (5432) for runtime');
  }
}

if (process.env.DIRECT_URL) {
  const maskedUrl = process.env.DIRECT_URL.replace(/:[^:]*?@/, ':****@');
  console.log(`🔗 DIRECT_URL (Migrations): ${maskedUrl}`);
  
  // Check connection type
  if (maskedUrl.includes(':5432')) {
    console.log('   ✅ Correct: Session Mode pooler (5432) for migrations');
  } else if (maskedUrl.includes(':6543')) {
    console.log('   ❌ Problem: Transaction Mode (6543) for migrations');
    console.log('      Migrations will likely fail!');
  }
} else {
  console.log('🔗 DIRECT_URL not set, will use DATABASE_URL for migrations');
}

const PORT = process.env.PORT || 3001;

// Step 1: Create a temporary HTTP server for Render health checks during migrations
console.log('🏥 Starting temporary health check server for Render...');
const tempServer = http.createServer((req, res) => {
  // Handle all common health check endpoints
  if (req.url === '/health' || req.url === '/' || req.url === '/api/health' || req.url === '/api/news/health') {
    res.writeHead(200, { 
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache'
    });
    res.end(JSON.stringify({
      status: 'migrating',
      message: 'Database migrations in progress',
      timestamp: new Date().toISOString()
    }));
  } else {
    res.writeHead(200, { 
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache'
    });
    res.end(JSON.stringify({
      status: 'initializing',
      message: 'Application starting up',
      timestamp: new Date().toISOString()
    }));
  }
});

tempServer.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Temporary server listening on port ${PORT} for Render health checks`);
  console.log('🗄️  Starting database migrations...');
  
  // Step 2: Run migrations (blocking)
  console.log('🚀 Running Prisma migrations...');
  const migrationResult = spawnSync('npx', ['prisma', 'migrate', 'deploy'], {
    stdio: 'inherit',
    env: process.env,
    encoding: 'utf8'
  });
  
  if (migrationResult.status === 0) {
    console.log('✅ Database migrations completed successfully');
  } else {
    console.warn(`⚠️  Database migrations failed with code: ${migrationResult.status}`);
    console.warn('This is common when using Transaction Mode pooler (6543)');
    console.warn('Attempting to create missing tables directly...');
    
    // Try to create missing tables using the working connection
    const createTablesResult = spawnSync('node', ['scripts/create-missing-tables.js'], {
      stdio: 'inherit',
      env: process.env,
      encoding: 'utf8'
    });
    
    if (createTablesResult.status === 0) {
      console.log('✅ Missing tables created successfully');
    } else {
      console.warn('⚠️  Could not create missing tables. Application will start with limited functionality.');
    }
  }
  
  // Step 3: Close temporary server and start the real application
  console.log('🔁 Switching to main application...');
  tempServer.close(() => {
    console.log('🎯 Starting main application...');
    
    const appProcess = spawn('node', ['dist/main.js'], {
      stdio: 'inherit',
      env: process.env,
      detached: false
    });
    
    appProcess.on('error', (err) => {
      console.error('❌ Failed to start application:', err.message);
      process.exit(1);
    });
    
    appProcess.on('exit', (code, signal) => {
      console.log(`🔴 Application exited with code ${code}, signal ${signal}`);
      process.exit(code || 1);
    });
    
    // Handle shutdown
    process.on('SIGTERM', () => {
      console.log('🛑 Received SIGTERM, shutting down gracefully...');
      appProcess.kill('SIGTERM');
    });
    
    process.on('SIGINT', () => {
      console.log('🛑 Received SIGINT, shutting down gracefully...');
      appProcess.kill('SIGINT');
    });
    
    console.log('✅ Main application starting...');
  });
});

tempServer.on('error', (err) => {
  console.error('❌ Failed to start temporary server:', err.message);
  process.exit(1);
});

console.log('⏳ Waiting for migrations to complete...');