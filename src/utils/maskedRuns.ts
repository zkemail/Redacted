/**
 * Split masked text (0x00 = hidden byte) into display segments, collapsing long redacted stretches.
 *
 * REASON: a proof that hides most of a body shows tens of thousands of █ blocks, which bury the
 * few revealed sentences. A redacted stretch is either
 *  - one long run of 0x00 (the hidden newlines are hidden too, so its "lines" are only wrapping), or
 *  - many fully hidden lines whose line breaks were revealed: 0x00 runs separated by whitespace only.
 * Both become one "collapsed" segment the page can show as "⋯ N redacted characters (~L lines) ⋯"
 * with a toggle to expand. Display only: the proof and the decoded bytes are unchanged.
 */
export type MaskedSegment =
  | { type: "text"; content: string }
  | { type: "masked"; content: string }
  /** a long redacted stretch: `content` is the original text of the stretch (hidden bytes and the whitespace between them) */
  | { type: "collapsed"; content: string; hidden: number; lines: number };

/** Collapse redacted stretches with at least this many hidden characters (~3 wrapped lines). */
export const COLLAPSE_MIN_HIDDEN = 240;
/** Characters per line used to estimate the line count of a run whose newlines are hidden. */
export const CHARS_PER_LINE = 80;

export function maskedSegments(text: string, minHidden = COLLAPSE_MIN_HIDDEN): MaskedSegment[] {
  // 1. plain runs: text vs 0x00
  const runs: { masked: boolean; content: string }[] = [];
  for (const m of text.matchAll(/\0+|[^\0]+/g)) runs.push({ masked: m[0][0] === "\0", content: m[0] });

  // 2. group masked runs that are separated only by whitespace (revealed line breaks between
  //    fully hidden lines) into one stretch
  const out: MaskedSegment[] = [];
  for (let i = 0; i < runs.length; ) {
    if (!runs[i].masked) {
      out.push({ type: "text", content: runs[i].content });
      i++;
      continue;
    }
    let j = i;
    let hidden = 0;
    let content = "";
    let breaks = 0;
    // extend while the next text run is whitespace only and is followed by another masked run
    for (;;) {
      hidden += runs[j].content.length;
      content += runs[j].content;
      const gap = runs[j + 1];
      if (gap && !gap.masked && /^\s+$/.test(gap.content) && runs[j + 2]?.masked) {
        content += gap.content;
        breaks += (gap.content.match(/\n/g) ?? []).length;
        j += 2;
        continue;
      }
      break;
    }
    if (hidden >= minHidden) {
      // Revealed line breaks give exact lines; hidden newlines don't, so estimate from length.
      const lines = Math.max(breaks + 1, Math.ceil(hidden / CHARS_PER_LINE));
      out.push({ type: "collapsed", content, hidden, lines });
    } else {
      // short: keep the original runs as they were
      for (let k = i; k <= j; k++) out.push({ type: runs[k].masked ? "masked" : "text", content: runs[k].content });
    }
    i = j + 1;
  }
  return out;
}
