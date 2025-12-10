/**
 * Represents a parsed email header with potential null bytes (masked characters)
 */
export interface ParsedMaskedHeader {
  from: string;
  to: string;
  subject: string;
  date: string;
  raw: string;
}

/**
 * Parse a raw email header string (potentially containing null bytes) into structured fields
 *
 * @param maskedHeader - Raw header string from proof output, may contain null bytes (0x00) for masked chars
 * @returns Parsed header fields
 */
export function parseMaskedHeader(maskedHeader: string): ParsedMaskedHeader {
  const result: ParsedMaskedHeader = {
    from: '',
    to: '',
    subject: '',
    date: '',
    raw: maskedHeader,
  };

  // Split header into lines (handle both \r\n and \n)
  const lines = maskedHeader.split(/\r?\n/);

  let currentField: 'from' | 'to' | 'subject' | 'date' | null = null;

  for (const line of lines) {
    // Check for field headers (case-insensitive)
    const lowerLine = line.toLowerCase();

    if (lowerLine.startsWith('from:')) {
      currentField = 'from';
      result.from = line.substring(5).trim();
    } else if (lowerLine.startsWith('to:')) {
      currentField = 'to';
      result.to = line.substring(3).trim();
    } else if (lowerLine.startsWith('subject:')) {
      currentField = 'subject';
      result.subject = line.substring(8).trim();
    } else if (lowerLine.startsWith('date:')) {
      currentField = 'date';
      result.date = line.substring(5).trim();
    } else if (line.startsWith(' ') || line.startsWith('\t')) {
      // Continuation of previous field (folded header)
      if (currentField) {
        result[currentField] += ' ' + line.trim();
      }
    } else {
      // New field we don't care about
      currentField = null;
    }
  }

  return result;
}

/**
 * Convert a string with null bytes to display format
 * Null bytes (0x00) are converted to a special marker for rendering
 *
 * @param text - Text potentially containing null bytes
 * @returns Text with null bytes marked for display
 */
export function nullBytesToDisplayMarker(text: string): string {
  // Replace null bytes with Unicode block character for display
  // The actual rendering will use CSS to show black blocks
  // Using String.fromCharCode(0) to create null byte pattern to avoid eslint no-control-regex
  const nullBytePattern = new RegExp(String.fromCharCode(0), 'g');
  return text.replace(nullBytePattern, '\u2588'); // Full block character
}
