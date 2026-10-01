/**
 * Place the UI's per-field redactions (From / To / Date / Subject) into a mask over the
 * DKIM-canonical signed header, the bytes the circuit publishes.
 *
 * REASON (security review finding 3): the old lookup searched for a lowercase "to:" at a line
 * start and for the value on that one line. That only works for c=relaxed, which lowercases names
 * and unfolds values. c=simple (supported since PR #23) keeps "To:" and folded lines, so the lookup
 * failed, the mask was skipped with a console warning, and the proof published the recipient the
 * user had hidden. Now names match case-insensitively, folded values are searched unfolded, and a
 * redaction that can't be placed is reported so proof generation refuses instead of leaking.
 */

/** Value ranges [start, end) of every `name:` field (any case); a range includes its folds. */
export function headerFieldValueRanges(header: string, name: string): { start: number; end: number }[] {
  const lower = name.toLowerCase();
  const out: { start: number; end: number }[] = [];
  let lineStart = 0;
  while (lineStart < header.length) {
    // The field runs to the first line break NOT followed by SP/HTAB (those are folds).
    let end = lineStart;
    for (;;) {
      const nl = header.indexOf("\n", end);
      if (nl < 0) {
        end = header.length;
        break;
      }
      if (header[nl + 1] === " " || header[nl + 1] === "\t") {
        end = nl + 1;
        continue;
      }
      end = nl > 0 && header[nl - 1] === "\r" ? nl - 1 : nl;
      break;
    }
    const m = /^([^:\s]+)[ \t]*:/.exec(header.slice(lineStart, end));
    if (m && m[1].toLowerCase() === lower) out.push({ start: lineStart + m[0].length, end });
    const next = header.indexOf("\n", end);
    if (next < 0) break;
    lineStart = next + 1;
  }
  return out;
}

/**
 * Mark the hidden characters of `value` (fieldBits[i] === 0 hides value[i]) in `out`, a mask
 * aligned with `header`. Every `name:` field is searched, with folds (CRLF before SP/HTAB)
 * skipped. If the value can't be found but the user hid ALL of it, the whole field value is
 * hidden instead. A field that isn't signed is trivially placed (the proof doesn't contain it).
 * Returns false if a redaction of a signed field could not be placed.
 */
export function placeHeaderFieldMask(
  header: string,
  name: string,
  value: string,
  fieldBits: number[],
  out: number[]
): boolean {
  if (!fieldBits.some((b) => b === 0)) return true;
  const ranges = headerFieldValueRanges(header, name);
  // REASON: a field the sender didn't sign (not in DKIM h=) isn't in the signed header, so the
  // proof never publishes it and there is nothing to hide. Found on the private-emls corpus: 17 of
  // 63 verifiable emails don't sign Date, 1 doesn't sign To; refusing those would be a false alarm.
  if (ranges.length === 0) return true;
  const hideAll = value.length > 0 && fieldBits.length >= value.length && fieldBits.slice(0, value.length).every((b) => b === 0);
  let placed = false;
  for (const { start, end } of ranges) {
    // Unfolded view of the field value and each view character's position in `header`.
    let view = "";
    const at: number[] = [];
    for (let i = start; i < end; i++) {
      const c = header[i];
      if ((c === "\r" && header[i + 1] === "\n") || (c === "\n" && (header[i + 1] === " " || header[i + 1] === "\t"))) continue;
      view += c;
      at.push(i);
    }
    let pos = value ? view.indexOf(value) : -1;
    if (pos < 0 && value) pos = view.toLowerCase().indexOf(value.toLowerCase());
    if (pos >= 0) {
      for (let i = 0; i < value.length; i++) if (fieldBits[i] === 0) out[at[pos + i]] = 0;
      placed = true;
    } else if (hideAll) {
      // e.g. an RFC 2047 encoded subject: the decoded text isn't in the raw bytes. Hide the value.
      for (const i of at) out[i] = 0;
      placed = true;
    }
  }
  return placed;
}
