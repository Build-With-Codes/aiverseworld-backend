#!/usr/bin/env node
/**
 * Simple production startup script for Render.com
 * Starts application immediately, runs migrations in background
 */

require('dotenv/config');

console.log('🚀 Starting AiverseWorld Backend');
console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
console.log(`🔌 PORT from env: ${process.env.PORT || '3001 (default)'}`);
console.log(`🌐 RENDER environment: ${process.env.RENDER || 'not set'}`);

// Start the application immediately
console.log('🎯 Launching main application...');
const { spawn } = require('node:child_process');

const app = spawn('node', ['dist/main.js'], {
  stdio: 'inherit',
  env: process.env,
  detached: false
});

app.on('error', (err) => {
  console.error('❌ Failed to start application:', err.message);
  process.exit(1);
});

app.on('exit', (code, signal) => {
  console.log(`🔴 Application exited with code ${code}, signal ${signal}`);
  process.exit(code || 1);
});

// Run migrations in background (non-blocking)
setTimeout(() => {
  console.log('🗄️  Starting background database migrations...');
  const migrations = spawn('node', ['scripts/deploy-migrations.js', '--allow-unreachable'], {
    stdio: 'pipe',
    env: process.env
  });
  
  migrations.stdout.on('data', (data) => {
    const msg = data.toString().trim();
    if (msg) console.log(`📦 Migration: ${msg}`);
  });
  
  migrations.stderr.on('data', (data) => {
    const msg = data.toString().trim();
    if (msg) console.error(`📦 Migration Error: ${msg}`);
  });
  
  migrations.on('close', (code) => {
    console.log(`📦 Migrations completed with code: ${code}`);
  });
}, 1000); // Wait 1 second before starting migrations

// Handle shutdown
process.on('SIGTERM', () => {
  console.log('🛑 Received SIGTERM, shutting down gracefully...');
  app.kill('SIGTERM');
});

process.on('SIGINT', () => {
  console.log('🛑 Received SIGINT, shutting down gracefully...');
  app.kill('SIGINT');
});

console.log('✅ Startup script running. Application should be starting now...');