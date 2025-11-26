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
   - `GCS_CREDENTIALS` - Your service account JSON as a string (see below)
   - `VITE_GCS_API_URL` - Your Render service URL (e.g., `https://your-app.onrender.com/api`)
   
   **Optional:**
   - `PORT` - Leave as default (10000) or set if needed
   - `ALLOWED_ORIGINS` - Comma-separated list of allowed CORS origins
   - `NODE_ENV` - Set to `production` (usually set automatically)

   **Setting GCS_CREDENTIALS:**
   
   You have two options:
   
   **Option A: Use GCS_CREDENTIALS (Recommended for Render)**
   - Copy the entire contents of your service account JSON file
   - Paste it as a single-line JSON string in the Render environment variable
   - Example: `{"type":"service_account","project_id":"...","private_key":"..."}`
   
   **Option B: Use GCS_KEY_FILE**
   - Upload your service account key file as a secret file
   - Set `GCS_KEY_FILE` to the path where Render stores it
   - This is more complex and not recommended

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

**Option 1: Set before first deploy (Recommended)**
1. When creating the service, Render will show you the service URL (e.g., `https://whistleblowing-app.onrender.com`)
2. Set `VITE_GCS_API_URL` environment variable to `https://your-service-name.onrender.com/api`
3. Replace `your-service-name` with your actual service name from Render

**Option 2: Two-step deployment**
1. First deployment: Deploy without `VITE_GCS_API_URL` (or with a placeholder)
2. After first deploy, note your service URL
3. Set `VITE_GCS_API_URL` to `https://your-service-name.onrender.com/api`
4. Redeploy (Render will rebuild with the new env var)

**Note**: Render automatically makes environment variables available during Docker builds. The Dockerfile is configured to accept `VITE_GCS_API_URL` as a build argument, which Render will pass automatically when the environment variable is set in the dashboard.

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

The Dockerfile is configured to accept `VITE_GCS_API_URL` as a build argument. Render should automatically pass environment variables to Docker builds, but if you encounter issues:

1. **Verify the environment variable is set** in Render dashboard
2. **Check build logs** to see if the variable is being passed
3. **Alternative**: Use Render's build command (Settings → Build & Deploy):
   ```bash
   docker build --build-arg VITE_GCS_API_URL=$VITE_GCS_API_URL -t render-app .
   ```
   Note: This might not work as Render handles Docker builds internally. The standard approach should work.

### Build Fails - General

- Check that all environment variables are set correctly
- Verify `VITE_GCS_API_URL` is set to your Render service URL
- Check build logs in Render dashboard
- Ensure `GCS_CREDENTIALS` is valid JSON (single-line format)

### Service Won't Start

- Verify `GCS_PROJECT_ID`, `GCS_BUCKET_NAME`, and `GCS_CREDENTIALS` are set correctly
- Check service logs in Render dashboard
- Ensure `GCS_CREDENTIALS` is valid JSON (single-line format)

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

