import { normalize } from "@/commands/search";

/** What « Aller à… » reads as a file search: `App.tsx:42` is App.tsx at line 42. */
export interface FileQuery {
  text: string;
  line?: number;
  column?: number;
}

/** A positive integer, or undefined: `0` is no line. */
function positive(digits: string | undefined): number | undefined {
  if (digits === undefined) return undefined;
  const value = Number(digits);
  return value >= 1 ? value : undefined;
}

/** The text to look for and, from a trailing `:42` or `:42:7`, where to go; a lone trailing `:` is dropped. */
export function parseFileQuery(query: string): FileQuery {
  let text = query.trim().replace(/:$/, "");
  const at = /:(\d+)(?::(\d+))?$/.exec(text);
  if (!at) return { text: text.trim() };
  text = text.slice(0, at.index).trim();
  const line = positive(at[1]);
  const column = line === undefined ? undefined : positive(at[2]);
  return {
    text,
    ...(line !== undefined && { line }),
    ...(column !== undefined && { column }),
  };
}

/** Ctrl+G's field: `42` or `42:7` (also `42,7`); null when it is not one (0, negative, letters, empty). */
export function parseLineTarget(input: string): { line: number; column?: number } | null {
  const at = /^(\d+)(?:\s*[:,]\s*(\d+))?$/.exec(input.trim());
  if (!at) return null;
  const line = positive(at[1]);
  if (line === undefined) return null;
  const column = positive(at[2]);
  return column === undefined ? { line } : { line, column };
}

function isSubsequence(needle: string, haystack: string): boolean {
  let at = 0;
  for (const char of haystack) if (char === needle[at]) at += 1;
  return at === needle.length;
}

/**
 * How well a term matches a path, 0 when it does not: the whole basename
 * scores best, then its start, inside it, inside the path, letters spread.
 * A term holding `/` is matched against the path only.
 */
function termScore(term: string, path: string, base: string): number {
  if (!term.includes("/")) {
    if (base === term) return 5;
    if (base.startsWith(term)) return 4;
    if (base.includes(term)) return 3;
  }
  if (path.includes(term)) return 2;
  if (isSubsequence(term, path)) return 1;
  return 0;
}

/** The sum of its terms' scores, null when one of them does not match. */
function fileScore(terms: readonly string[], path: string): number | null {
  const folded = normalize(path);
  const base = folded.slice(folded.lastIndexOf("/") + 1);
  let score = 0;
  for (const term of terms) {
    const one = termScore(term, folded, base);
    if (one === 0) return null;
    score += one;
  }
  return score;
}

/** The files matching `text`, best first, at most `limit`; without text, the first `limit` in their order. */
export function rankFiles(paths: readonly string[], text: string, limit = 50): string[] {
  const terms = normalize(text).split(/\s+/).filter(Boolean);
  if (terms.length === 0) return paths.slice(0, limit);
  return paths
    .map((path, index) => ({ path, index, score: fileScore(terms, path) }))
    .filter((entry): entry is { path: string; index: number; score: number } => entry.score !== null)
    .sort((a, b) => b.score - a.score || a.path.length - b.path.length || a.index - b.index)
    .slice(0, limit)
    .map((entry) => entry.path);
}
