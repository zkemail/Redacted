import { Storage } from '@google-cloud/storage';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync } from 'fs';

// Load environment variables from .env file
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Simple .env file loader
try {
  const envPath = join(__dirname, '.env');
  const envFile = readFileSync(envPath, 'utf-8');
  envFile.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const [key, ...valueParts] = trimmed.split('=');
      if (key && valueParts.length > 0) {
        const value = valueParts.join('=').trim();
        if (!process.env[key]) {
          process.env[key] = value;
        }
      }
    }
  });
} catch (error) {
  console.log('No .env file found');
}

// Initialize Google Cloud Storage
const storageConfig = {
  projectId: process.env.GCS_PROJECT_ID,
};

if (process.env.GCS_CREDENTIALS) {
  try {
    storageConfig.credentials = JSON.parse(process.env.GCS_CREDENTIALS);
  } catch (error) {
    console.error('Error parsing GCS_CREDENTIALS:', error);
    process.exit(1);
  }
} else if (process.env.GCS_KEY_FILE) {
  let keyFilePath = process.env.GCS_KEY_FILE;
  if (!keyFilePath.startsWith('/')) {
    keyFilePath = keyFilePath.replace(/^\.\/server\//, './');
    keyFilePath = join(__dirname, keyFilePath);
  }
  storageConfig.keyFilename = keyFilePath;
} else {
  console.error('Either GCS_CREDENTIALS or GCS_KEY_FILE environment variable is required');
  process.exit(1);
}

const storage = new Storage(storageConfig);
const bucketName = process.env.GCS_BUCKET_NAME;

if (!bucketName) {
  console.error('GCS_BUCKET_NAME environment variable is required');
  process.exit(1);
}

const bucket = storage.bucket(bucketName);

// Configure CORS for the bucket
async function setupCORS() {
  try {
    console.log(`Setting up CORS for bucket: ${bucketName}`);
    
    const corsConfiguration = [
      {
        origin: ['http://localhost:5173', 'http://localhost:5174', 'http://localhost:5175', 'http://localhost:3000', "https://whistleblower-god8.onrender.com"],
        method: ['PUT', 'GET', 'HEAD'],
        responseHeader: ['Content-Type', 'Content-Length'],
        maxAgeSeconds: 3600,
      },
    ];

    await bucket.setCorsConfiguration(corsConfiguration);
    console.log('✅ CORS configuration set successfully!');
    console.log('\nAllowed origins:');
    corsConfiguration[0].origin.forEach(origin => console.log(`  - ${origin}`));
    console.log('\nAllowed methods: PUT, GET, HEAD');
  } catch (error) {
    console.error('❌ Error setting up CORS:', error.message);
    process.exit(1);
  }
}

setupCORS();

