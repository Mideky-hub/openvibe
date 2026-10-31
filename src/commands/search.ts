/** Lower case, accents dropped: « Hermès » and « hermes » are the same (spec fenêtre §7.1). */
export function normalize(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/œ/g, "oe").replace(/æ/g, "ae");
}

const words = (text: string) => normalize(text).split(/[\s\-_/.·'’]+/).filter(Boolean);

function isSubsequence(needle: string, haystack: string): boolean {
  let at = 0;
  for (const char of haystack) if (char === needle[at]) at += 1;
  return at === needle.length;
}

/**
 * How well `query` matches an item (spec fenêtre §7.1), null when a term of
 * the query does not: a term at the start of a word of the label scores
 * best, then of a keyword, then inside a word, then with its letters spread.
 */
export function matchScore(query: string, label: string, keywords: readonly string[] = []): number | null {
  const terms = words(query);
  const labelWords = words(label);
  const allWords = [...labelWords, ...keywords.flatMap(words)];
  const haystack = allWords.join(" ");
  let score = 0;
  for (const term of terms) {
    if (labelWords.includes(term)) score += 5;
    else if (labelWords.some((w) => w.startsWith(term))) score += 4;
    else if (allWords.some((w) => w.startsWith(term))) score += 3;
    else if (haystack.includes(term)) score += 2;
    else if (isSubsequence(term, haystack)) score += 1;
    else return null;
  }
  return score;
}

type Text = { label: string; keywords: readonly string[] };

/** Every term starts a word of the label or of a keyword: no match inside a word, no letters spread. */
export function startsWords(query: string, { label, keywords }: Text): boolean {
  const score = matchScore(query, label, keywords);
  return score !== null && score >= 3 * words(query).length;
}
type Relevance = { score: number; coverage: number };

/** The share of the label's words a term starts: « renommer » is all of « Renommer », a third of « Renommer le workspace ». */
function coverage(query: string, label: string): number {
  const terms = words(query);
  const labelWords = words(label);
  if (labelWords.length === 0) return 0;
  return labelWords.filter((w) => terms.some((t) => w.startsWith(t))).length / labelWords.length;
}

function relevance(query: string, { label, keywords }: Text): Relevance | null {
  const score = matchScore(query, label, keywords);
  return score === null ? null : { score, coverage: coverage(query, label) };
}

/** Negative when `a` is the better match: the score, then the share of the label covered. */
const better = (a: Relevance, b: Relevance) => b.score - a.score || b.coverage - a.coverage;

/** The items matching `query`, best first, ties in their order; every item, in order, without a query. */
export function rank<T>(items: readonly T[], query: string, textOf: (item: T) => Text): T[] {
  if (words(query).length === 0) return [...items];
  return items
    .map((item, index) => ({ item, index, relevance: relevance(query, textOf(item)) }))
    .filter((entry): entry is { item: T; index: number; relevance: Relevance } => entry.relevance !== null)
    .sort((a, b) => better(a.relevance, b.relevance) || a.index - b.index)
    .map((entry) => entry.item);
}

/**
 * Ranked sections, the one holding the best match first while searching, so
 * that the first line, the one chosen, is the best of all (retours J8b,
 * amending spec fenêtre §7.1); in their own order without a search and on ties.
 */
export function rankSections<T, S extends { items: readonly T[] }>(sections: readonly S[], query: string, textOf: (item: T) => Text): S[] {
  if (words(query).length === 0) return [...sections];
  const NONE: Relevance = { score: -1, coverage: 0 };
  return sections
    .map((section, index) => ({ section, index, best: (section.items[0] && relevance(query, textOf(section.items[0]))) || NONE }))
    .sort((a, b) => better(a.best, b.best) || a.index - b.index)
    .map((entry) => entry.section);
}
