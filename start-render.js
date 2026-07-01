#!/usr/bin/env node
/**
 * Production startup script for Render.com
 * Starts the application immediately and runs migrations in background
 */

require('dotenv/config');
const { spawn } = require('node:child_process');
const path = require('node:path');

console.log('🚀 Starting AiverseWorld backend for Render...');

// Get the port from environment (Render sets this dynamically)
const port = process.env.PORT || 3001;
console.log(`📡 Will listen on port: ${port}`);

// Start the main application immediately
console.log('🎯 Starting main application...');
const appProcess = spawn('node', ['dist/main.js'], {
  stdio: 'inherit',
  env: { ...process.env, PORT: port }
});

// In background, run migrations (non-blocking)
console.log('🗄️  Starting database migrations in background...');
const migrationProcess = spawn('node', ['scripts/deploy-migrations.js', '--allow-unreachable'], {
  stdio: 'pipe',
  env: process.env
});

// Log migration output (but don't block)
migrationProcess.stdout.on('data', (data) => {
  console.log(`📦 Migration: ${data.toString().trim()}`);
});

migrationProcess.stderr.on('data', (data) => {
  console.error(`📦 Migration Error: ${data.toString().trim()}`);
});

migrationProcess.on('close', (code) => {
  if (code === 0) {
    console.log('✅ Database migrations completed successfully');
  } else {
    console.log(`⚠️  Database migrations completed with code: ${code}`);
  }
});

// Handle application exit
appProcess.on('close', (code) => {
  console.log(`🔴 Application exited with code: ${code}`);
  migrationProcess.kill();
  process.exit(code);
});

// Handle process signals
process.on('SIGTERM', () => {
  console.log('🛑 Received SIGTERM, shutting down...');
  appProcess.kill('SIGTERM');
  migrationProcess.kill('SIGTERM');
});

process.on('SIGINT', () => {
  console.log('🛑 Received SIGINT, shutting down...');
  appProcess.kill('SIGINT');
  migrationProcess.kill('SIGINT');
});

// Keep the process alive
process.stdin.resume();