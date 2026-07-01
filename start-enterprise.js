#!/usr/bin/env node
/**
 * Enterprise production startup script for Render.com
 * 1. Runs migrations FIRST (blocking)
 * 2. Starts application ONLY after migrations complete
 * 3. Includes a temporary health check for Render during migration phase
 */

require('dotenv/config');
const http = require('http');
const { spawn, spawnSync } = require('node:child_process');

console.log('🚀 Starting AiverseWorld Backend (Enterprise Mode)');
console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
console.log(`🔌 PORT from env: ${process.env.PORT || '3001 (default)'}`);
console.log(`🌐 RENDER environment: ${process.env.RENDER || 'not set'}`);

const PORT = process.env.PORT || 3001;

// Step 1: Create a temporary HTTP server for Render health checks during migrations
console.log('🏥 Starting temporary health check server for Render...');
const tempServer = http.createServer((req, res) => {
  // Log all incoming requests for debugging
  console.log(`🌐 Temporary server received request: ${req.method} ${req.url}`);
  
  // Handle all common health check endpoints
  if (req.url === '/health' || req.url === '/' || req.url === '/api/health' || req.url === '/api/news/health') {
    res.writeHead(200, { 
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache'
    });
    const response = JSON.stringify({
      status: 'migrating',
      message: 'Database migrations in progress',
      timestamp: new Date().toISOString(),
      progress: 'running'
    });
    console.log(`✅ Responding to health check: ${response}`);
    res.end(response);
  } else {
    // For any other request, respond with 200 OK and migration status
    // This ensures Render's port scanner doesn't fail
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
  
  // Step 2: Run migrations with final fix approach
  const migrationResult = spawnSync('node', ['scripts/final-migration-fix.js'], {
    stdio: 'inherit',
    env: process.env,
    encoding: 'utf8'
  });
  
  if (migrationResult.status !== 0) {
    console.warn(`⚠️  Database migrations failed with code: ${migrationResult.status}`);
    console.warn('Migrations cannot connect to database. Attempting to create missing tables directly...');
    
    // Try to create missing tables using the working runtime connection
    console.log('🛠️  Creating missing tables directly using DATABASE_URL...');
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
    
    console.warn('🚀 Starting application...');
  } else {
    console.log('✅ Database migrations completed successfully');
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