# Setting Up CORS for Google Cloud Storage

The CORS error occurs because Google Cloud Storage buckets don't allow cross-origin requests by default. You need to configure CORS on your bucket.

## Quick Setup (Using Script)

Run the setup script:

```bash
npm run setup-cors
```

This will configure CORS for your bucket to allow uploads from common localhost ports.

## Manual Setup (Using gsutil)

If you prefer to set it up manually, create a CORS configuration file:

1. Create a file `cors.json`:

```json
[
  {
    "origin": [
      "http://localhost:5173",
      "http://localhost:5174",
      "http://localhost:5175",
      "http://localhost:3000"
    ],
    "method": ["PUT", "GET", "HEAD"],
    "responseHeader": ["Content-Type", "Content-Length"],
    "maxAgeSeconds": 3600
  }
]
```

2. Apply the CORS configuration:

```bash
gsutil cors set cors.json gs://your-bucket-name
```

## Manual Setup (Using Google Cloud Console)

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Navigate to **Cloud Storage** > **Buckets**
3. Click on your bucket name
4. Go to the **Configuration** tab
5. Scroll down to **CORS configuration**
6. Click **Edit CORS configuration**
7. Paste the following JSON:

```json
[
  {
    "origin": [
      "http://localhost:5173",
      "http://localhost:5174",
      "http://localhost:5175",
      "http://localhost:3000"
    ],
    "method": ["PUT", "GET", "HEAD"],
    "responseHeader": ["Content-Type", "Content-Length"],
    "maxAgeSeconds": 3600
  }
]
```

8. Click **Save**

## For Production

When deploying to production, update the CORS configuration to include your production domain:

```json
[
  {
    "origin": [
      "https://your-production-domain.com",
      "https://www.your-production-domain.com"
    ],
    "method": ["PUT", "GET", "HEAD"],
    "responseHeader": ["Content-Type", "Content-Length"],
    "maxAgeSeconds": 3600
  }
]
```

## Verify CORS is Working

After setting up CORS, try uploading an EML file again. The CORS error should be resolved.

## Troubleshooting

- **Still getting CORS errors?** Make sure you've added your exact frontend URL (including the port) to the CORS origins
- **Changes not taking effect?** CORS changes can take a few minutes to propagate
- **Need to allow all origins?** You can use `["*"]` for the origin, but this is less secure and not recommended for production

