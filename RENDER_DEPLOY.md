# Deploying to Render.com

This guide will help you deploy the whistleblowing application to Render.com using Docker.

## Prerequisites

1. A [Render.com](https://render.com) account
2. Your code pushed to a Git repository (GitHub, GitLab, or Bitbucket)
3. Google Cloud Storage credentials configured (see `SETUP_GCS.md`)

## Deployment Steps

### Option 1: Using render.yaml (Recommended)

1. **Push your code to Git**
   ```bash
   git add .
   git commit -m "Add Docker and Render configuration"
   git push
   ```

2. **Connect your repository to Render**
   - Go to [Render Dashboard](https://dashboard.render.com)
   - Click "New +" → "Web Service"
   - Connect your Git repository
   - Render will automatically detect the `render.yaml` file

3. **Configure Environment Variables in Render Dashboard**
   
   Go to your service → Environment tab and set:
   
   **Required:**
   - `GCS_PROJECT_ID` - Your Google Cloud Project ID
   - `GCS_BUCKET_NAME` - Your GCS bucket name
   - `GCS_CREDENTIALS` - Your service account gsJSON as a string (see below)
   - `VITE_GCS_API_URL` - Your Render service URL (e.g., `https://your-app.onrender.com/api`)
   
   **Optional:**
   - `PORT` - Leave as default (10000) or set if needed
   - `ALLOWED_ORIGINS` - Comma-separated list of allowed CORS origins
   - `NODE_ENV` - Set to `production` (usually set automatically)

   **Setting GCS_CREDENTIALS (Service Account File):**
   
   **Recommended: Use GCS_CREDENTIALS environment variable**
   
   Render doesn't support uploading files easily, so the best approach is to use the `GCS_CREDENTIALS` environment variable:
   
   1. **Get your service account JSON file** (from Google Cloud Console)
   2. **Convert it to a single-line JSON string**:
      - Open the JSON file in a text editor
      - Remove all line breaks and extra spaces
      - Make it a single line
      - Or use a tool like `jq` to minify it:
        ```bash
        jq -c . service-account-key.json
        ```
   3. **Set in Render Dashboard**:
      - Go to your service → **Environment** tab
      - Click **Add Environment Variable**
      - **Key**: `GCS_CREDENTIALS`
      - **Value**: Paste the entire single-line JSON string
      - Example format: `{"type":"service_account","project_id":"my-project","private_key_id":"...","private_key":"-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n","client_email":"...","client_id":"...","auth_uri":"...","token_uri":"...","auth_provider_x509_cert_url":"...","client_x509_cert_url":"..."}`
   
   **Important Notes:**
   - The JSON must be valid and on a single line
   - Keep the `\n` characters in the `private_key` field (they're part of the key format)
   - Never commit this value to Git - it's sensitive
   - Render encrypts environment variables at rest
   
   **Alternative: GCS_KEY_FILE (Not Recommended)**
   
   If you must use a file:
   1. You'd need to base64 encode the file and store it as an env var
   2. Then decode it in the Dockerfile
   3. This is more complex and error-prone
   4. **Stick with GCS_CREDENTIALS for simplicity**

4. **Deploy**
   - Render will automatically build and deploy when you push to your main branch
   - Or click "Manual Deploy" → "Deploy latest commit"

### Option 2: Manual Setup (Without render.yaml)

1. **Create a new Web Service**
   - Go to Render Dashboard → "New +" → "Web Service"
   - Connect your Git repository

2. **Configure the Service**
   - **Name**: `whistleblowing-app` (or your preferred name)
   - **Environment**: `Docker`
   - **Region**: Choose your preferred region
   - **Branch**: `main` (or your default branch)
   - **Root Directory**: Leave empty (or set if your Dockerfile is in a subdirectory)
   - **Dockerfile Path**: `./Dockerfile`
   - **Docker Context**: `.`

3. **Set Environment Variables**
   Same as Option 1, step 3.

4. **Set Build Command** (if needed)
   - Render will use the Dockerfile automatically, but you can set:
   - **Build Command**: (leave empty, Docker handles this)
   - **Start Command**: (leave empty, Dockerfile CMD handles this)

5. **Deploy**
   - Click "Create Web Service"
   - Render will build and deploy automatically

## Important Notes

### VITE_GCS_API_URL

Since Vite environment variables are replaced at **build time**, you need to set `VITE_GCS_API_URL` before the Docker build starts. 

**Important**: You'll need to know your Render service URL to set this. 

**How to Set VITE_GCS_API_URL in Render:**

1. **Get your Render service URL**
   - When creating the service, Render shows the URL format: `https://your-service-name.onrender.com`
   - Or check your service dashboard after creation

2. **Set the environment variable in Render Dashboard**
   - Go to your service → **Environment** tab
   - Click **Add Environment Variable**
   - **Key**: `VITE_GCS_API_URL`
   - **Value**: `https://your-service-name.onrender.com/api`
   - Replace `your-service-name` with your actual service name
   - **Important**: Make sure to include `/api` at the end

3. **Configure Render to pass it as a build argument**
   - Go to your service → **Settings** → **Build & Deploy**
   - Scroll to **Build Command** (if visible)
   - **OR** use Render's environment variable feature (Render should automatically pass env vars to Docker builds)

**Two-Step Deployment (If you don't know the URL yet):**

1. **First deployment**: 
   - Deploy without `VITE_GCS_API_URL` set (or use a placeholder like `https://placeholder.onrender.com/api`)
   - The app will work but API calls will fail until you set the correct URL

2. **After first deploy**:
   - Note your actual service URL from the Render dashboard
   - Set `VITE_GCS_API_URL` to `https://your-actual-service-name.onrender.com/api`
   - Go to **Manual Deploy** → **Clear build cache & deploy** to rebuild with the new variable

**Example:**
If your service is named `whistleblowing-app`, set:
```
VITE_GCS_API_URL=https://whistleblowing-app.onrender.com/api
```

**Note**: The Dockerfile creates a `.env.production` file from this variable during build, which Vite will automatically use. If the variable is not set, the frontend will fall back to `http://localhost:3001/api` (which won't work in production).

### Port Configuration

Render uses port `10000` by default. The Dockerfile is configured to use the `PORT` environment variable, which Render sets automatically. You don't need to change this.

### Health Check

Render will automatically check the `/health` endpoint to verify your service is running.

### CORS Configuration

After deployment, update your Google Cloud Storage CORS configuration to include your Render domain:

```json
[
  {
    "origin": [
      "https://your-app-name.onrender.com"
    ],
    "method": ["PUT", "GET", "HEAD"],
    "responseHeader": ["Content-Type", "Content-Length"],
    "maxAgeSeconds": 3600
  }
]
```

See `CORS_SETUP.md` for instructions on updating CORS.

## Troubleshooting

### Build Fails - VITE_GCS_API_URL not found

If the build fails or the frontend can't connect to the API:

1. **Verify the environment variable is set** in Render dashboard (Environment tab)
2. **Check the value format**: Should be `https://your-service.onrender.com/api` (with `/api` at the end)
3. **Check build logs** in Render dashboard - look for the message "Created .env.production with VITE_GCS_API_URL=..."
4. **Clear build cache and redeploy**: 
   - Go to **Manual Deploy** → **Clear build cache & deploy**
   - This ensures the build argument is passed correctly

**If Render doesn't automatically pass the env var as a build arg:**

Render should pass environment variables to Docker builds automatically, but if it doesn't work:

1. Go to **Settings** → **Build & Deploy**
2. Set **Build Command** to:
   ```bash
   docker build --build-arg VITE_GCS_API_URL=$VITE_GCS_API_URL -t render-app .
   ```
3. However, note that Render handles Docker builds internally, so this may not work. The standard approach (setting it as an environment variable) should work in most cases.

### Build Fails - General

- Check that all environment variables are set correctly
- Verify `VITE_GCS_API_URL` is set to your Render service URL
- Check build logs in Render dashboard
- Ensure `GCS_CREDENTIALS` is valid JSON (single-line format)

### Service Won't Start

- Verify `GCS_PROJECT_ID`, `GCS_BUCKET_NAME`, and `GCS_CREDENTIALS` are set correctly
- Check service logs in Render dashboard
- Ensure `GCS_CREDENTIALS` is valid JSON (single-line format)

### GCS_CREDENTIALS Issues

**Error: "Error parsing GCS_CREDENTIALS"**
- The JSON string is invalid or has line breaks
- Make sure it's a single-line JSON string
- Use `jq -c . service-account-key.json` to minify it
- Check that all quotes are properly escaped

**Error: "Either GCS_CREDENTIALS or GCS_KEY_FILE environment variable is required"**
- Make sure `GCS_CREDENTIALS` is set in Render dashboard
- Check the Environment tab of your service
- Verify the variable name is exactly `GCS_CREDENTIALS` (case-sensitive)

**Service account authentication fails**
- Verify the service account has the correct permissions (Storage Object Admin)
- Check that `GCS_PROJECT_ID` matches the project in your credentials
- Ensure the service account JSON is complete and not truncated

### Frontend Can't Connect to API

- Verify `VITE_GCS_API_URL` is set correctly and matches your Render service URL
- Check that the service is running (visit `/health` endpoint)
- Check browser console for CORS errors

### CORS Errors

- Update GCS bucket CORS configuration to include your Render domain
- See `CORS_SETUP.md` for detailed instructions

## Updating the Deployment

1. Push changes to your Git repository
2. Render will automatically detect changes and redeploy
3. Or manually trigger a deploy from the Render dashboard

## Custom Domain

To use a custom domain:

1. Go to your service → Settings → Custom Domains
2. Add your domain
3. Update `VITE_GCS_API_URL` to use your custom domain
4. Update GCS CORS configuration to include your custom domain
5. Redeploy

## Cost Considerations

- Render's **Starter** plan is free but services spin down after 15 minutes of inactivity
- **Standard** plan ($7/month) keeps services always on
- Consider upgrading for production use

