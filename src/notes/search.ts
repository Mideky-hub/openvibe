export interface SearchHit {
  name: string;
  /** The first line holding a word of the search; empty when only the name matched. */
  excerpt: string;
}

/** Without case nor accents: « evite » finds « Évité ». */
const plain = (text: string) => text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

/** The notes holding every word of `query`, in their name or text; matches in the name first. */
export function searchNotes(notes: readonly { name: string; text: string }[], query: string): SearchHit[] {
  const words = plain(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return notes.map(({ name }) => ({ name, excerpt: "" }));
  const inName: SearchHit[] = [];
  const inText: SearchHit[] = [];
  for (const { name, text } of notes) {
    const title = plain(name);
    const body = plain(text);
    if (!words.every((word) => title.includes(word) || body.includes(word))) continue;
    const line = text.split("\n").find((candidate) => words.some((word) => plain(candidate).includes(word)));
    (words.some((word) => title.includes(word)) ? inName : inText).push({ name, excerpt: line?.trim() ?? "" });
  }
  return [...inName, ...inText];
}
