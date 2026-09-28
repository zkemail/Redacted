import { API_BASE } from "./apiBase";

/**
 * Generates a UUID for a new email/proof pair
 * @returns Promise with the UUID
 */
export async function generateUuid(): Promise<string> {
  const apiUrl = API_BASE;

  try {
    const response = await fetch(`${apiUrl}/generate-uuid`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(errorData.error || `Failed to generate UUID: ${response.status}`);
    }

    const { uuid } = await response.json();
    return uuid;
  } catch (error) {
    console.error('Error generating UUID:', error);
    throw error;
  }
}


