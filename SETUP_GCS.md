# Google Cloud Storage Setup with Signed URLs

This guide will help you set up Google Cloud Storage to store EML files directly from the frontend using signed URLs.

## Prerequisites

1. A Google Cloud Platform (GCP) account
2. A GCP project (free tier is fine - no billing required for basic usage)
3. Node.js and npm installed

## Step 1: Create a Google Cloud Storage Bucket

1. Go to the [Google Cloud Console](https://console.cloud.google.com/)
2. Navigate to **Cloud Storage** > **Buckets**
3. Click **Create Bucket**
4. Choose a unique bucket name (e.g., `your-project-whistleblowing-eml`)
5. Select a location type and region
6. Choose **Standard** storage class
7. Set access control to **Uniform**
8. Click **Create**

**Note**: You can use the free tier - GCS offers 5GB storage and 5,000 Class A operations per month for free.

## Step 2: Create a Service Account

1. Navigate to **IAM & Admin** > **Service Accounts**
2. Click **Create Service Account**
3. Enter a name (e.g., `gcs-signed-url-service`)
4. Click **Create and Continue**
5. Grant the role **Storage Object Admin** (this allows creating signed URLs and making files public)
6. Click **Continue** and then **Done**

## Step 3: Create and Download Service Account Key

1. Click on the service account you just created
2. Go to the **Keys** tab
3. Click **Add Key** > **Create new key**
4. Choose **JSON** format
5. Click **Create** - the key file will be downloaded automatically
6. **Important**: Store this file securely and never commit it to version control

## Step 4: Configure Public Access

After files are uploaded, they need to be publicly readable. The backend will automatically make each uploaded file public, so you don't need to configure this manually.

## Step 5: Configure Environment Variables

### For the Backend Server (`server/.env`)

Create a file `server/.env` with the following:

```env
# Google Cloud Storage Configuration
GCS_PROJECT_ID=your-project-id
GCS_BUCKET_NAME=your-bucket-name

# Path to your service account key file
GCS_KEY_FILE=./server/service-account-key.json

# Server Configuration
PORT=3001
```

**Alternative**: If you prefer to use credentials as an environment variable (useful for deployment):

```env
GCS_PROJECT_ID=your-project-id
GCS_BUCKET_NAME=your-bucket-name
GCS_CREDENTIALS={"type":"service_account","project_id":"...","private_key_id":"...","private_key":"...","client_email":"...","client_id":"...","auth_uri":"...","token_uri":"...","auth_provider_x509_cert_url":"...","client_x509_cert_url":"..."}
```

### For the Frontend (`.env.local`)

Create a file `.env.local` in the root directory:

```env
# URL of the backend API server
# For local development:
VITE_GCS_API_URL=http://localhost:3001/api

# For production, update to your deployed backend URL:
# VITE_GCS_API_URL=https://your-api-domain.com/api
```

## Step 6: Install Dependencies

```bash
npm install
```

## Step 7: Run the Application

### Development (run both frontend and backend):

```bash
npm run dev:full
```

This will start:
- Frontend on `http://localhost:5173` (or your Vite port)
- Backend server on `http://localhost:3001`

### Or run separately:

```bash
# Terminal 1: Frontend
npm run dev

# Terminal 2: Backend
npm run server
```

## How It Works

1. **Frontend requests signed URL**: When a proof is generated, the frontend requests a signed URL from the backend
2. **Backend generates signed URL**: The backend uses the service account to generate a time-limited signed URL (15 minutes)
3. **Frontend uploads directly to GCS**: The frontend uploads the EML file directly to GCS using the signed URL
4. **Backend makes file public**: After upload, the backend makes the file publicly accessible
5. **Public URL returned**: The frontend receives the public URL to access the file

## File URLs

Uploaded files will be accessible at URLs like:
```
https://storage.googleapis.com/your-bucket-name/eml/uuid.eml
```

## Testing

1. Upload an EML file through the UI
2. Generate a proof
3. Check the browser console - you should see a log message with the public URL of the uploaded EML file
4. Verify the file is accessible by opening the URL in a new tab

## Troubleshooting

### Error: "GCS_BUCKET_NAME environment variable is required"
- Make sure you've created `server/.env` with the correct variables

### Error: "Could not load the default credentials"
- Verify the path to your service account key file is correct
- Make sure the service account has the necessary permissions (Storage Object Admin)

### Error: "Access denied" when accessing uploaded files
- Check that the backend successfully made the file public
- Verify the bucket IAM policy allows public reads

### Files not uploading
- Check that the backend server is running
- Verify the `VITE_GCS_API_URL` environment variable is set correctly
- Check the browser console and server logs for error messages

## Security Notes

- **Never commit** your service account key file to version control
- Add `server/.env` and `*.json` (service account keys) to `.gitignore`
- The backend only generates signed URLs - it never sees the file content
- Signed URLs expire after 15 minutes for security

