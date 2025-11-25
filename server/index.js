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

// Generate a UUID for a new email/proof pair
app.post('/api/generate-uuid', async (req, res) => {
  try {
    const uuid = randomUUID();
    res.json({ uuid });
  } catch (error) {
    console.error('Error generating UUID:', error);
    res.status(500).json({
      error: 'Failed to generate UUID',
      message: error.message,
    });
  }
});

// Generate signed URL for EML upload (using provided UUID)
app.post('/api/get-upload-url', async (req, res) => {
  try {
    const { uuid } = req.body;
    
    if (!uuid) {
      return res.status(400).json({ error: 'UUID is required' });
    }

    // Store in folder structure: eml/{uuid}/email.eml
    const filename = `eml/${uuid}/email.eml`;
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
      uuid: uuid,
    });
  } catch (error) {
    console.error('Error generating signed URL:', error);
    res.status(500).json({
      error: 'Failed to generate upload URL',
      message: error.message,
    });
  }
});

// Generate signed URL for proof upload (using the same UUID as EML)
app.post('/api/get-proof-upload-url', async (req, res) => {
  try {
    const { uuid, headerMask, bodyMask } = req.body;
    
    if (!uuid) {
      return res.status(400).json({ error: 'UUID is required' });
    }

    // Store proof in the same folder: eml/{uuid}/proof.json
    const filename = `eml/${uuid}/proof.json`;
    const file = bucket.file(filename);

    // Generate a signed URL for PUT upload (valid for 15 minutes)
    const [url] = await file.getSignedUrl({
      version: 'v4',
      action: 'write',
      expires: Date.now() + 15 * 60 * 1000, // 15 minutes
      contentType: 'application/json',
    });

    // Store metadata in the same folder: eml/{uuid}/metadata.json
    const metadata = {
      headerMask: headerMask || [],
      bodyMask: bodyMask || [],
      createdAt: new Date().toISOString(),
    };

    const metadataFile = bucket.file(`eml/${uuid}/metadata.json`);
    await metadataFile.save(JSON.stringify(metadata), {
      contentType: 'application/json',
    });

    // Also get the public URL (after upload)
    const publicUrl = `https://storage.googleapis.com/${bucketName}/${filename}`;

    res.json({
      uploadUrl: url,
      publicUrl: publicUrl,
      filename: filename,
      uuid: uuid,
    });
  } catch (error) {
    console.error('Error generating proof upload URL:', error);
    res.status(500).json({
      error: 'Failed to generate proof upload URL',
      message: error.message,
    });
  }
});

// Retrieve all data (proof, metadata, and EML info) by UUID
app.get('/api/get-data/:uuid', async (req, res) => {
  try {
    const { uuid } = req.params;
    const proofFilename = `eml/${uuid}/proof.json`;
    const metadataFilename = `eml/${uuid}/metadata.json`;
    const emlFilename = `eml/${uuid}/email.eml`;
    
    const proofFile = bucket.file(proofFilename);
    const metadataFile = bucket.file(metadataFilename);
    const emlFile = bucket.file(emlFilename);

    // Check if files exist
    const [proofExists] = await proofFile.exists();
    const [metadataExists] = await metadataFile.exists();
    const [emlExists] = await emlFile.exists();
    
    if (!proofExists || !metadataExists || !emlExists) {
      return res.status(404).json({ 
        error: 'Data not found',
        missing: {
          proof: !proofExists,
          metadata: !metadataExists,
          eml: !emlExists,
        }
      });
    }

    // Download all files
    const [proofContents] = await proofFile.download();
    const [metadataContents] = await metadataFile.download();
    
    // Parse JSON and validate structure
    let proofData;
    try {
      const proofText = proofContents.toString();
      proofData = JSON.parse(proofText);
      
      // Validate structure
      if (!proofData || typeof proofData !== 'object') {
        throw new Error('Invalid proof data: not an object');
      }
      if (!Array.isArray(proofData.publicInputs)) {
        throw new Error('Invalid proof data: publicInputs is not an array');
      }
      if (!Array.isArray(proofData.proof)) {
        throw new Error('Invalid proof data: proof is not an array');
      }
      
      // IMPORTANT: publicInputs should be STRINGS (hex strings), not arrays
      // The library expects strings, so we should preserve them as strings
      proofData.publicInputs = proofData.publicInputs.map((arr, idx) => {
        // If it's already a string, keep it as is
        if (typeof arr === 'string') {
          console.log(`Server: publicInputs[${idx}] is string (preserved)`);
          return arr;
        }
        // If it's an array, it means we stored it incorrectly - convert back to hex string
        if (Array.isArray(arr)) {
          console.warn(`Server: publicInputs[${idx}] is array (converting to hex string)`);
          const hexString = arr.map((b) => {
            const num = typeof b === 'number' ? b : parseInt(b, 10);
            if (isNaN(num) || num < 0 || num > 255) {
              throw new Error(`Invalid byte value at publicInputs[${idx}]: ${b}`);
            }
            return num.toString(16).padStart(2, '0');
          }).join('');
          return hexString;
        }
        throw new Error(`Invalid publicInput type at index ${idx}: ${typeof arr}`);
      });
      
      // Ensure proof is an array of numbers
      if (Array.isArray(proofData.proof)) {
        proofData.proof = proofData.proof.map((v, vIdx) => {
          if (typeof v === 'number') {
            if (isNaN(v) || v < 0 || v > 255) {
              throw new Error(`Invalid byte value at proof[${vIdx}]: ${v}`);
            }
            return v;
          }
          if (typeof v === 'string') {
            const num = parseInt(v, 10);
            if (isNaN(num) || num < 0 || num > 255) {
              throw new Error(`Invalid byte value at proof[${vIdx}]: ${v}`);
            }
            return num;
          }
          throw new Error(`Invalid value type at proof[${vIdx}]: ${typeof v}`);
        });
      }
    } catch (error) {
      console.error('Error parsing proof data:', error);
      console.error('Proof contents (first 500 chars):', proofContents.toString().substring(0, 500));
      throw error;
    }
    
    const metadata = JSON.parse(metadataContents.toString());

    // Construct EML URL
    const emlUrl = `https://storage.googleapis.com/${bucketName}/${emlFilename}`;

    // Combine all data
    res.json({
      proof: proofData,
      emlUrl: emlUrl,
      emlPath: emlFilename,
      headerMask: metadata.headerMask || [],
      bodyMask: metadata.bodyMask || [],
      createdAt: metadata.createdAt,
    });
  } catch (error) {
    console.error('Error retrieving data:', error);
    res.status(500).json({
      error: 'Failed to retrieve data',
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

