import PostalMime, { type Address } from 'postal-mime';

export interface EmailFieldRange {
  rawStart: number;
  rawLength: number;
  displayOffset: number;
  displayLength: number;
}

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

  try {
    parsedEmail = await parser.parse(emlContent);

    // Extract TO, FROM, SUBJECT values
    from = getAddressFromEntry(parsedEmail?.from);
    to = getFirstAddress(parsedEmail?.to);
    subject = parsedEmail?.subject || '';

    if (!from || !to || !subject) {
      // Fallback to regex if values are not present in parsedEmail
      const fromMatch = emlContent.match(/^From:\s.*<([^>]+)>/m);
      const toMatch = emlContent.match(/^\s*(?:To|Delivered-To):\s*(?:.*?<([^>]+)>|(.+))/m);
      const subjectMatch = emlContent.match(/^Subject:\s*(.*)/m);

      from = fromMatch ? fromMatch[1] : extractDisplayValue(fromRange).trim() || 'Unknown';
      to = toMatch ? (toMatch[1] || toMatch[2]) : extractDisplayValue(toRange).trim() || 'Unknown';
      subject = subjectMatch ? subjectMatch[1] : extractDisplayValue(subjectRange).trim() || 'Unknown';
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

