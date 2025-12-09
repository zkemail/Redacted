import PostalMime, { type Address } from 'postal-mime';
import { verifyDKIMSignature } from '@zk-email/zkemail-nr';

export interface EmailFieldRange {
  rawStart: number;
  rawLength: number;
  displayOffset: number;
  displayLength: number;
}

// Type for DKIM verification result from the SDK
export type DKIMResult = Awaited<ReturnType<typeof verifyDKIMSignature>>;

export interface ParsedEmail {
  from: string;
  to: string;
  cc?: string;
  bcc?: string;
  subject: string;
  time: string;
  body: string;
  bodyText: string;
  bodyHtml?: string;
  raw: string;
  ranges: {
    from?: EmailFieldRange;
    to?: EmailFieldRange;
    time?: EmailFieldRange;
    subject?: EmailFieldRange;
    body: EmailFieldRange;
  };
  // DKIM-related fields
  dkimSignature?: string;
  canonicalizedHeaders?: string;
  canonicalizedBody?: string;
  minimalEmlContent?: string;
  // Actual DKIM-canonicalized headers from verifyDKIMSignature
  dkimCanonicalizedHeaders?: string;
  // Actual DKIM-canonicalized body from verifyDKIMSignature
  dkimCanonicalizedBody?: string;
  // Full DKIM verification result for reuse during proof generation (Phase 2 optimization)
  dkimResult?: DKIMResult;
}

/**
 * Processes email body HTML for safe display
 */
function processEmailBody(html: string): string {
  // Basic HTML processing - can be extended for sanitization if needed
  return html;
}

/**
 * Parses an .eml file content and extracts email information using PostalMime.
 * Falls back to regex parsing if PostalMime fails.
 * All ranges are provided relative to the original raw string.
 */
const getAddressFromEntry = (entry?: Address): string => {
  if (!entry) return '';
  if ('address' in entry && entry.address) {
    return entry.address;
  }
  if ('group' in entry && Array.isArray(entry.group) && entry.group.length > 0) {
    const first = entry.group[0];
    return first.address || first.name || '';
  }
  return entry.name || '';
};

const getFirstAddress = (entries?: Address[]): string => {
  if (!entries || entries.length === 0) return '';
  return getAddressFromEntry(entries[0]);
};

/**
 * Extracts the full header value from DKIM-canonicalized headers.
 * Canonicalized headers have lowercase header names and format: "headername:value"
 * Returns the full value (e.g., "Yogesh Shahi <notifications@github.com>")
 *
 * IMPORTANT: Must match header name at line start to avoid matching substrings
 * (e.g., "to:" should not match inside "reply-to:")
 */
const getHeaderValueFromCanonicalizedHeaders = (canonicalizedHeaders: string, headerName: string): string | null => {
  const headerPrefix = headerName.toLowerCase() + ':';

  // Search for header at start of string or after newline to avoid substring matches
  // (e.g., "to:" should not match "reply-to:")
  let headerStart = -1;

  // Check if at start of string
  if (canonicalizedHeaders.startsWith(headerPrefix)) {
    headerStart = 0;
  } else {
    // Search for header after newline
    const patterns = ['\r\n' + headerPrefix, '\n' + headerPrefix];
    for (const pattern of patterns) {
      const pos = canonicalizedHeaders.indexOf(pattern);
      if (pos >= 0) {
        headerStart = pos + pattern.length - headerPrefix.length;
        break;
      }
    }
  }

  if (headerStart < 0) return null;

  const valueStart = headerStart + headerPrefix.length;

  // Find end of header (next \r\n or \n or end of string)
  let valueEnd = canonicalizedHeaders.indexOf('\r\n', valueStart);
  if (valueEnd < 0) {
    valueEnd = canonicalizedHeaders.indexOf('\n', valueStart);
  }
  if (valueEnd < 0) {
    valueEnd = canonicalizedHeaders.length;
  }

  // Return trimmed value (canonicalization removes leading/trailing whitespace)
  return canonicalizedHeaders.slice(valueStart, valueEnd).trim();
};

export async function parseEmlFile(emlContent: string): Promise<ParsedEmail> {
  const raw = emlContent;

  const parser = new PostalMime();
  let parsedEmail: Awaited<ReturnType<PostalMime["parse"]>> | undefined;

  // Helper to find header ranges inside the raw text
  const doubleNewlineMatch = /\r?\n\r?\n/.exec(raw);
  const headersEndIndex = doubleNewlineMatch ? doubleNewlineMatch.index! : raw.length;
  const headersRaw = raw.slice(0, headersEndIndex);

  const findHeaderRange = (name: string): EmailFieldRange | undefined => {
    const regex = new RegExp(`^${name}\\s*:(.*)$`, 'im');
    const match = regex.exec(headersRaw);
    if (!match) return undefined;

    const line = match[0];
    const headerStartInHeaders = match.index!;
    const colonIndex = line.indexOf(':');
    if (colonIndex === -1) return undefined;

    const valueRaw = line.slice(colonIndex + 1);
    const rawStart = headerStartInHeaders + colonIndex + 1;
    const rawLength = valueRaw.length;
    const leadingWhitespaceMatch = valueRaw.match(/^\s*/);
    const leadingWhitespace = leadingWhitespaceMatch ? leadingWhitespaceMatch[0].length : 0;
    const trimmedValue = valueRaw.trimEnd();
    const displayLength = Math.max(trimmedValue.length - leadingWhitespace, 0);
    const displayOffset = leadingWhitespace;

    return {
      rawStart,
      rawLength,
      displayOffset,
      displayLength,
    };
  };

  const fromRange = findHeaderRange('From');
  const toRange = findHeaderRange('To');
  const timeRange = findHeaderRange('Date');
  const subjectRange = findHeaderRange('Subject');

  const extractDisplayValue = (range?: EmailFieldRange): string => {
    if (!range) return '';
    const rawValue = raw.slice(range.rawStart, range.rawStart + range.rawLength);
    return rawValue.slice(range.displayOffset, range.displayOffset + range.displayLength);
  };

  // Parse headers for range calculation and DKIM
  const headerMap: Record<string, string> = {};
  headersRaw.split(/\r?\n/).forEach(line => {
    const colonIndex = line.indexOf(':');
    if (colonIndex > 0) {
      const key = line.slice(0, colonIndex).trim().toLowerCase();
      const value = line.slice(colonIndex + 1).trim();
      headerMap[key] = value;
    }
  });

  let from = '';
  let to = '';
  let subject = '';
  let emailBodyText = '';
  let emailBodyHtml: string | undefined;
  let dkimSignature: string | undefined;
  let canonicalizedHeaders: string | undefined;
  let canonicalizedBody: string | undefined;
  let minimalEmlContent: string | undefined;
  let dkimCanonicalizedHeaders: string | undefined;
  let dkimCanonicalizedBody: string | undefined;
  let dkimResult: DKIMResult | undefined;

  // Get actual DKIM-canonicalized headers and body for accurate masking
  // Also store full DKIM result to reuse during proof generation (Phase 2 optimization)
  try {
    dkimResult = await verifyDKIMSignature(emlContent, undefined, undefined, true);
    // Convert Buffers to strings for storage
    dkimCanonicalizedHeaders = dkimResult.headers.toString('utf-8');
    dkimCanonicalizedBody = dkimResult.body.toString('utf-8');
  } catch (error) {
    console.warn('[DKIM] Verification failed during parsing:', error);
    // Continue without canonicalized headers/body - will fall back to position-based mapping
  }

  try {
    parsedEmail = await parser.parse(emlContent);

    // IMPORTANT: For masking to work, UI must display values from DKIM-canonicalized headers
    // because that's what the circuit verifies. Extract FROM, TO, SUBJECT from canonicalized headers first.
    if (dkimCanonicalizedHeaders) {
      const canonicalFrom = getHeaderValueFromCanonicalizedHeaders(dkimCanonicalizedHeaders, 'from');
      const canonicalTo = getHeaderValueFromCanonicalizedHeaders(dkimCanonicalizedHeaders, 'to');
      const canonicalSubject = getHeaderValueFromCanonicalizedHeaders(dkimCanonicalizedHeaders, 'subject');

      if (canonicalFrom) {
        from = canonicalFrom;
      }
      if (canonicalTo) {
        to = canonicalTo;
      }
      if (canonicalSubject) {
        subject = canonicalSubject;
      }
    }

    // Fall back to PostalMime values if not found in canonicalized headers
    if (!from) from = getAddressFromEntry(parsedEmail?.from);
    if (!to) to = getFirstAddress(parsedEmail?.to);
    if (!subject) subject = parsedEmail?.subject || '';

    if (!from || !to || !subject) {
      // Final fallback to regex if values are not present
      const fromMatch = emlContent.match(/^From:\s.*<([^>]+)>/m);
      const toMatch = emlContent.match(/^\s*(?:To|Delivered-To):\s*(?:.*?<([^>]+)>|(.+))/m);
      const subjectMatch = emlContent.match(/^Subject:\s*(.*)/m);

      if (!from) from = fromMatch ? fromMatch[1] : extractDisplayValue(fromRange).trim() || 'Unknown';
      if (!to) to = toMatch ? (toMatch[1] || toMatch[2]) : extractDisplayValue(toRange).trim() || 'Unknown';
      if (!subject) subject = subjectMatch ? subjectMatch[1] : extractDisplayValue(subjectRange).trim() || 'Unknown';
    }

    // Process the email body for UI display
    if (parsedEmail.html) {
      emailBodyHtml = processEmailBody(parsedEmail.html);
      emailBodyText = parsedEmail.text || emailBodyHtml || '';
    } else {
      emailBodyText = parsedEmail.text || '';
    }

    // Extract and canonicalize DKIM signature and headers
    dkimSignature = emlContent.match(/^DKIM-Signature:.*(\r?\n\s+.+)*/gm)?.[0] || '';

    // Define required headers for DKIM signature (per canonicalization rules)
    const requiredHeaders = ['Date', 'From', 'To', 'Subject', 'MIME-Version', 'Content-Type', 'Message-ID'];
    const canonicalizedHeadersArray = requiredHeaders
      .map((header) => {
        const match = emlContent.match(new RegExp(`^${header}:.*`, 'm'));
        return match ? match[0].toLowerCase().trim() : null;
      })
      .filter(Boolean) as string[];

    canonicalizedHeaders = canonicalizedHeadersArray.join('\r\n') || undefined;

    // Canonicalize body (using text/plain part for DKIM signing)
    const normalizedBody = (emailBodyText || 'No body content found')
      .replace(/[\t ]+(\r?\n)/g, '$1')  // Remove trailing spaces from lines
      .replace(/\r?\n$/, '\r\n')        // Ensure single newline at end
      .trim();
    canonicalizedBody = normalizedBody || undefined;

    // Build minimal EML content with canonicalized DKIM parts
    minimalEmlContent = [
      dkimSignature ?? '',
      canonicalizedHeaders ?? '',
      '',
      canonicalizedBody ?? ''
    ].join('\r\n\r\n');

  } catch (error) {
    console.error("Error parsing EML file with PostalMime:", error);

    // Fallback to regex parsing
    const fromMatch = emlContent.match(/^From:\s.*<([^>]+)>/m);
    const toMatch = emlContent.match(/^To:\s.*<([^>]+)>/m);
    const subjectMatch = emlContent.match(/^Subject:\s*(.*)/m);

    from = fromMatch ? fromMatch[1] : extractDisplayValue(fromRange).trim() || 'Unknown';
    to = toMatch ? toMatch[1] : extractDisplayValue(toRange).trim() || 'Unknown';
    subject = subjectMatch ? subjectMatch[1] : extractDisplayValue(subjectRange).trim() || 'Unknown';

    emailBodyText = '';
    emailBodyHtml = undefined;
  }

  // Calculate body range
  const doubleNewlineMatchForBody = /\r?\n\r?\n/.exec(raw);
  const separatorLength = doubleNewlineMatchForBody ? doubleNewlineMatchForBody[0].length : 0;
  const bodyStartIndex = separatorLength ? headersEndIndex + separatorLength : headersEndIndex;
  const bodyRaw = raw.slice(bodyStartIndex);
  const bodyDisplay = emailBodyText || emailBodyHtml || bodyRaw;

  const bodyRange: EmailFieldRange = {
    rawStart: bodyStartIndex,
    rawLength: bodyRaw.length,
    displayOffset: 0,
    displayLength: bodyDisplay.length,
  };

  // Extract time from Date header
  const time = extractDisplayValue(timeRange).trim() || '';

  return {
    from: from || extractDisplayValue(fromRange).trim() || 'Unknown',
    to: to || extractDisplayValue(toRange).trim() || 'Unknown',
    cc: headerMap['cc'] ? headerMap['cc'].trim() : undefined,
    bcc: headerMap['bcc'] ? headerMap['bcc'].trim() : undefined,
    subject: subject || extractDisplayValue(subjectRange).trim() || 'Unknown',
    time: time || 'Unknown',
    body: bodyDisplay,
    bodyText: emailBodyText || bodyDisplay,
    bodyHtml: emailBodyHtml || undefined,
    raw,
    ranges: {
      from: fromRange,
      to: toRange,
      time: timeRange,
      subject: subjectRange,
      body: bodyRange,
    },
    dkimSignature: dkimSignature || undefined,
    canonicalizedHeaders: canonicalizedHeaders || undefined,
    canonicalizedBody: canonicalizedBody || undefined,
    minimalEmlContent: minimalEmlContent || undefined,
    dkimCanonicalizedHeaders: dkimCanonicalizedHeaders || undefined,
    dkimCanonicalizedBody: dkimCanonicalizedBody || undefined,
    dkimResult: dkimResult || undefined,
  };
}

/**
 * Splits email body into paragraphs for rendering
 */
export function splitBodyIntoParagraphs(body: string): string[] {
  if (!body) return [];
  const paragraphs = body.split(/\r?\n\r?\n/).filter(p => p.trim());
  if (paragraphs.length === 0) {
    return body.split(/\r?\n/).filter(p => p.trim());
  }
  return paragraphs;
}

