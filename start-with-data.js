#!/usr/bin/env node

require('dotenv/config');

const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('fs');

console.log('=== Starting Aiverse World Backend with Data Import ===');

// Run migrations first
console.log('\n[1/3] Running database migrations...');

const migrateProcess = spawn('npx', ['prisma', 'migrate', 'deploy'], {
  stdio: 'inherit',
  cwd: __dirname,
  shell: false
});

migrateProcess.on('close', (migrateCode) => {
  if (migrateCode !== 0) {
    console.error(`Migrations failed with code ${migrateCode}`);
    console.log('Trying with --allow-unreachable flag...');
    
    const migrateAllowProcess = spawn('npx', ['prisma', 'migrate', 'deploy', '--allow-unreachable'], {
      stdio: 'inherit',
      cwd: __dirname,
      shell: false
    });

    migrateAllowProcess.on('close', (allowCode) => {
      if (allowCode !== 0) {
        console.error(`Migrations with --allow-unreachable also failed with code ${allowCode}`);
        process.exit(1);
      }
      importData();
    });
  } else {
    importData();
  }
});

function importData() {
  console.log('\n[2/3] Importing sample data...');
  
  // Check if data directory exists, create if not
  const dataDir = path.join(__dirname, 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  
  // Create sample data
  const sampleAiTools = [
    {
      slug: 'chatgpt',
      rank: 1,
      name: 'ChatGPT',
      category: 'Chat',
      subcategory: 'General Purpose',
      company: 'OpenAI',
      website: 'https://chat.openai.com',
      domain: 'openai.com',
      favicon: 'https://openai.com/favicon.ico',
      freePlan: 'Yes (limited)',
      freeTrial: true,
      pricingModel: 'Freemium',
      startingPriceUsd: 20,
      shortDescription: 'Advanced AI chatbot for conversation and task assistance',
      summary: 'ChatGPT is a conversational AI assistant that can help with writing, coding, analysis, and creative tasks.',
      features: ['Conversational', 'Code generation', 'Text analysis', 'Creative writing'],
      bestFor: ['Writing assistance', 'Learning', 'Coding help', 'Research'],
      targetAudience: ['Students', 'Developers', 'Writers', 'Researchers'],
      tags: ['chat', 'ai assistant', 'generative ai'],
      aiType: ['LLM', 'Conversational AI'],
      modalities: ['Text'],
      modelProvider: ['OpenAI'],
      apiAvailable: true,
      openSource: false,
      deploymentType: ['Cloud'],
      platforms: ['Web', 'Mobile'],
      status: 'Active',
      sourceUrl: 'https://openai.com/chatgpt',
      sourceType: 'official',
      searchText: 'chatgpt openai chat general purpose assistant writing coding'
    },
    {
      slug: 'midjourney',
      rank: 2,
      name: 'Midjourney',
      category: 'Image Generation',
      subcategory: 'Art & Design',
      company: 'Midjourney',
      website: 'https://www.midjourney.com',
      domain: 'midjourney.com',
      favicon: 'https://www.midjourney.com/favicon.ico',
      freePlan: 'No',
      freeTrial: true,
      pricingModel: 'Subscription',
      startingPriceUsd: 10,
      shortDescription: 'AI image generation for creative artwork and designs',
      summary: 'Midjourney creates stunning, artistic images from text descriptions using advanced diffusion models.',
      features: ['Text-to-image', 'Art styles', 'Upscaling', 'Variations'],
      bestFor: ['Art creation', 'Design concepts', 'Marketing visuals', 'Creative projects'],
      targetAudience: ['Artists', 'Designers', 'Marketers', 'Creatives'],
      tags: ['image generation', 'art', 'design', 'creative'],
      aiType: ['Diffusion Model', 'Generative AI'],
      modalities: ['Image'],
      modelProvider: ['Midjourney'],
      apiAvailable: false,
      openSource: false,
      deploymentType: ['Cloud'],
      platforms: ['Discord', 'Web'],
      status: 'Active',
      sourceUrl: 'https://www.midjourney.com',
      sourceType: 'official',
      searchText: 'midjourney image generation art design creative ai'
    }
  ];

  const sampleProblems = [
    {
      title: 'Code documentation takes too much time',
      description: 'Developers spend excessive time writing and maintaining documentation instead of coding.',
      industry: 'Software Development',
      frequency: 'Daily',
      painScore: 8,
      aiSolvable: 10,
      notAiSolvable: 2
    },
    {
      title: 'Meeting notes organization',
      description: 'Important information from meetings gets lost or buried in long transcripts.',
      industry: 'All Industries',
      frequency: 'Weekly',
      painScore: 7,
      aiSolvable: 12,
      notAiSolvable: 3
    }
  ];

  // Save sample data to files
  fs.writeFileSync(
    path.join(dataDir, 'sample-ai-tools.json'),
    JSON.stringify(sampleAiTools, null, 2)
  );

  fs.writeFileSync(
    path.join(dataDir, 'sample-problems.json'),
    JSON.stringify(sampleProblems, null, 2)
  );

  console.log('Sample data files created');
  
  // Run the data import script
  const importScript = path.join(__dirname, 'scripts', 'deploy-with-data.js');
  if (fs.existsSync(importScript)) {
    console.log('Running data import...');
    const importProcess = spawn('node', [importScript], {
      stdio: 'inherit',
      cwd: __dirname,
      shell: true
    });

    importProcess.on('close', (importCode) => {
      if (importCode === 0) {
        startServer();
      } else {
        console.error(`Data import failed with code ${importCode}`);
        console.log('Continuing with server start anyway...');
        startServer();
      }
    });
  } else {
    console.log('No import script found, starting server...');
    startServer();
  }
}

function startServer() {
  console.log('\n[3/3] Starting NestJS server...');
  
  // Disable the auto db push in development by setting PRISMA_AUTO_PUSH=false
  const serverProcess = spawn('node', ['dist/main.js'], {
    stdio: 'inherit',
    cwd: __dirname,
    shell: true,
    env: {
      ...process.env,
      PRISMA_AUTO_PUSH: 'false',
      NODE_ENV: process.env.NODE_ENV || 'production'
    }
  });

  serverProcess.on('close', (code) => {
    console.log(`Server process exited with code ${code}`);
  });

  // Handle termination signals
  process.on('SIGINT', () => {
    console.log('\nReceived SIGINT. Shutting down...');
    serverProcess.kill('SIGINT');
  });

  process.on('SIGTERM', () => {
    console.log('\nReceived SIGTERM. Shutting down...');
    serverProcess.kill('SIGTERM');
  });
}