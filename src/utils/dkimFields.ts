/**
 * Locate the DKIM-Signature field and its bh= value in a DKIM-canonicalized header, for the
 * circuit's dkim_header_sequence / body_hash_index inputs.
 *
 * REASON: @zk-email/zkemail-nr's getHeaderSequence only matches "dkim-signature"/"Dkim-signature",
 * stops at the first line break, and takes the FIRST such header. With c=simple canonicalization
 * the name keeps its case ("DKIM-Signature") and the field is folded (CRLF + TAB), so input
 * generation threw ("Field dkim-signature not found"). The signature being verified is always the
 * LAST header of the canonical header block. The circuit (vendor/zkemail headers/*.nr) accepts
 * the same shapes this finds.
 */
export interface DkimFieldSequence {
  /** start of "dkim-signature:" (any case) */
  index: number;
  /** field length up to, not including, the terminating CRLF (or header end) */
  length: number;
  /** index of the first character of the bh= value */
  bodyHashIndex: number;
}

export function dkimFieldSequence(header: string): DkimFieldSequence {
  let index = -1;
  for (const m of header.matchAll(/(?:^|\r\n)dkim-signature:/gi)) index = m.index + (m[0].startsWith("\r\n") ? 2 : 0);
  if (index < 0) throw new Error("No DKIM-Signature field in the signed header");
  let end = header.length;
  for (let i = header.indexOf("\r\n", index); i >= 0; i = header.indexOf("\r\n", i + 2)) {
    const next = header[i + 2];
    if (next !== " " && next !== "\t") {
      end = i;
      break;
    }
  }
  const field = header.slice(index, end);
  // bh= must start a tag: after ':' or ';', optionally one space or a fold (CRLF + SP/HTAB)
  const m = /(?:[:;] ?|;\r\n[ \t])bh=/.exec(field);
  if (!m) throw new Error("bh= tag not found in a position the circuit accepts");
  return { index, length: end - index, bodyHashIndex: index + m.index + m[0].length };
}
