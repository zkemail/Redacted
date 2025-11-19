import express from 'express';
import cors from 'cors';
import { Storage } from '@google-cloud/storage';
import { randomUUID } from 'crypto';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync } from 'fs';

// Load environment variables from .env file
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Simple .env file loader
try {
  const envPath = join(__dirname, '.env');
  console.log('Loading .env file from:', envPath);
  const envFile = readFileSync(envPath, 'utf-8');
  let loadedCount = 0;
  envFile.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const [key, ...valueParts] = trimmed.split('=');
      if (key && valueParts.length > 0) {
        const value = valueParts.join('=').trim();
        if (!process.env[key]) {
          process.env[key] = value;
          loadedCount++;
          console.log(`Loaded env var: ${key}`);
        }
      }
    }
  });
  console.log(`Loaded ${loadedCount} environment variables from .env file`);
} catch (error) {
  // .env file is optional - environment variables can be set externally
  console.log('No .env file found, using environment variables:', error.message);
}

const app = express();
const port = process.env.PORT || 3001;

// Middleware
// CORS configuration - allow frontend origins
const allowedOrigins = process.env.ALLOWED_ORIGINS 
  ? process.env.ALLOWED_ORIGINS.split(',')
  : ['http://localhost:5173', 'http://localhost:3000'];

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    if (allowedOrigins.indexOf(origin) !== -1 || process.env.NODE_ENV === 'development') {
      callback(null, true);
    } else {
      callback(null, true); // Allow all for now - restrict in production if needed
    }
  },
  credentials: true,
}));
app.use(express.json());

// Initialize Google Cloud Storage
const storageConfig = {
  projectId: process.env.GCS_PROJECT_ID,
};

// Use credentials from environment variable if provided, otherwise use key file
if (process.env.GCS_CREDENTIALS) {
  try {
    storageConfig.credentials = JSON.parse(process.env.GCS_CREDENTIALS);
  } catch (error) {
    console.error('Error parsing GCS_CREDENTIALS:', error);
    process.exit(1);
  }
} else if (process.env.GCS_KEY_FILE) {
  // Resolve the key file path relative to the server directory
  let keyFilePath = process.env.GCS_KEY_FILE;
  if (!keyFilePath.startsWith('/')) {
    // Remove './server/' prefix if present, or use as-is
    keyFilePath = keyFilePath.replace(/^\.\/server\//, './');
    keyFilePath = join(__dirname, keyFilePath);
  }
  console.log('Using GCS key file:', keyFilePath);
  storageConfig.keyFilename = keyFilePath;
} else {
  console.error('Either GCS_CREDENTIALS or GCS_KEY_FILE environment variable is required');
  process.exit(1);
}

const storage = new Storage(storageConfig);
const bucketName = process.env.GCS_BUCKET_NAME;

console.log('Environment check:');
console.log('  GCS_PROJECT_ID:', process.env.GCS_PROJECT_ID || 'NOT SET');
console.log('  GCS_BUCKET_NAME:', bucketName || 'NOT SET');
console.log('  GCS_KEY_FILE:', process.env.GCS_KEY_FILE || 'NOT SET');
console.log('  GCS_CREDENTIALS:', process.env.GCS_CREDENTIALS ? 'SET (hidden)' : 'NOT SET');

if (!bucketName) {
  console.error('GCS_BUCKET_NAME environment variable is required');
  process.exit(1);
}

const bucket = storage.bucket(bucketName);

// Generate signed URL for upload
app.post('/api/get-upload-url', async (req, res) => {
  try {
    // Generate a unique filename
    const filename = `eml/${randomUUID()}.eml`;
    const file = bucket.file(filename);

    // Generate a signed URL for PUT upload (valid for 15 minutes)
    const [url] = await file.getSignedUrl({
      version: 'v4',
      action: 'write',
      expires: Date.now() + 15 * 60 * 1000, // 15 minutes
      contentType: 'message/rfc822',
    });

    // Also get the public URL (after upload)
    const publicUrl = `https://storage.googleapis.com/${bucketName}/${filename}`;

    res.json({
      uploadUrl: url,
      publicUrl: publicUrl,
      filename: filename,
    });
  } catch (error) {
    console.error('Error generating signed URL:', error);
    res.status(500).json({
      error: 'Failed to generate upload URL',
      message: error.message,
    });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});

