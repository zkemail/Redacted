/**
 * Uploads EML content to Google Cloud Storage using signed URLs
 * This allows direct uploads from the frontend without exposing credentials
 * @param emlContent - The EML file content as a string
 * @returns Promise with the public URL of the uploaded file
 */
export async function uploadEmlToGCS(emlContent: string): Promise<string> {
  const apiUrl = import.meta.env.VITE_GCS_API_URL || 'http://localhost:3001/api';

  try {
    // Step 1: Get a signed URL for upload
    const urlResponse = await fetch(`${apiUrl}/get-upload-url`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!urlResponse.ok) {
      const errorData = await urlResponse.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(errorData.error || `Failed to get upload URL: ${urlResponse.status}`);
    }

    const { uploadUrl, publicUrl, filename } = await urlResponse.json();

    // Step 2: Upload directly to GCS using the signed URL
    const uploadResponse = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': 'message/rfc822',
      },
      body: emlContent,
    });

    if (!uploadResponse.ok) {
      throw new Error(`Upload failed with status ${uploadResponse.status}`);
    }

    // File is already accessible via bucket-level permissions (uniform bucket-level access)
    // No need to make it public individually

    return publicUrl;
  } catch (error) {
    console.error('Error uploading EML to GCS:', error);
    throw error;
  }
}

