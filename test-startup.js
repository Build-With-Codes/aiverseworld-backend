#!/usr/bin/env node
/**
 * Test script to debug startup issues
 */

console.log('=== STARTUP DEBUG ===');
console.log('Current directory:', process.cwd());
console.log('PORT environment variable:', process.env.PORT || '(not set)');
console.log('NODE_ENV:', process.env.NODE_ENV || '(not set)');
console.log('RENDER:', process.env.RENDER || '(not set)');

// Test if we can require and run the main application
try {
  console.log('\n=== Testing main application ===');
  
  // Instead of spawning, let's try to require and see if it throws
  console.log('dist/main.js exists?', require('fs').existsSync('dist/main.js'));
  
  // Read a bit of the compiled main.js to check
  const fs = require('fs');
  const mainContent = fs.readFileSync('dist/main.js', 'utf8').substring(0, 500);
  console.log('First 500 chars of dist/main.js:', mainContent);
  
  // Test port binding directly
  console.log('\n=== Testing port binding ===');
  const net = require('net');
  const testPort = process.env.PORT || 3001;
  
  const testServer = net.createServer();
  testServer.on('error', (err) => {
    console.log(`Port ${testPort} is NOT available: ${err.message}`);
  });
  
  testServer.listen(testPort, '0.0.0.0', () => {
    console.log(`Port ${testPort} IS available on 0.0.0.0`);
    testServer.close();
  });
  
  // Wait a bit for the test
  setTimeout(() => {
    console.log('\n=== Startup debug complete ===');
    process.exit(0);
  }, 2000);
  
} catch (error) {
  console.error('Error during debug:', error.message);
  process.exit(1);
}