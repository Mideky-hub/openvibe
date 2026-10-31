export type Eol = "\n" | "\r\n";

/** The ending most lines use. CodeMirror works in LF: a CRLF file must come back in CRLF (spec studio code §3). */
export function detectEol(text: string): Eol {
  const crlf = text.match(/\r\n/g)?.length ?? 0;
  const lf = (text.match(/\n/g)?.length ?? 0) - crlf;
  return crlf > lf ? "\r\n" : "\n";
}

export const toLf = (text: string) => text.replace(/\r\n?/g, "\n");

export const withEol = (lfText: string, eol: Eol) => (eol === "\n" ? lfText : lfText.replace(/\n/g, eol));

export interface Replacement {
  from: number;
  to: number;
  insert: string;
}

/** What differs between two texts, as one replacement: a reload then leaves the cursor where it was. */
export function smallestChange(before: string, after: string): Replacement | null {
  if (before === after) return null;
  const shortest = Math.min(before.length, after.length);
  let start = 0;
  while (start < shortest && before[start] === after[start]) start++;
  let end = 0;
  while (end < shortest - start && before[before.length - 1 - end] === after[after.length - 1 - end]) end++;
  return { from: start, to: before.length - end, insert: after.slice(start, after.length - end) };
}
