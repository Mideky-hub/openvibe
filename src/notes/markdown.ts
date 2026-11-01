import { readLink } from "./links";

export interface ListItem {
  text: string;
  /** Only on a task. */
  checked?: boolean;
}

export type Block =
  | { kind: "heading"; level: number; text: string }
  | { kind: "paragraph"; text: string }
  | { kind: "quote"; text: string }
  | { kind: "rule" }
  | { kind: "code"; language: string; text: string }
  | { kind: "list"; ordered: boolean; items: ListItem[] };

export type Inline =
  | { kind: "text"; text: string }
  | { kind: "strong" | "em" | "strike" | "code"; text: string }
  | { kind: "wikilink"; target: string; label: string }
  | { kind: "link"; url: string; label: string };

const HEADING = /^(#{1,6})\s+(.*?)\s*#*$/;
const RULE = /^(-{3,}|\*{3,}|_{3,})$/;
const FENCE = /^(```|~~~)\s*(\S*)/;
const BULLET = /^[-*+]\s+(.*)$/;
const NUMBERED = /^\d+[.)]\s+(.*)$/;
const TASK = /^\[( |x|X)\]\s+(.*)$/;

const itemOf = (text: string): ListItem => {
  const task = TASK.exec(text);
  return task ? { text: task[2], checked: task[1] !== " " } : { text };
};

/**
 * The Markdown a note uses, as data for React to draw: nothing is ever read as
 * HTML, so a note written by an agent cannot run anything (spec notes §3).
 */
export function parseMarkdown(source: string): Block[] {
  const blocks: Block[] = [];
  const lines = source.split(/\r?\n/);
  let i = 0;
  while (i < lines.length) {
    const line = lines[i].trim();
    const fence = FENCE.exec(line);
    if (fence) {
      const code: string[] = [];
      for (i++; i < lines.length && !lines[i].trim().startsWith(fence[1]); i++) code.push(lines[i]);
      i++;
      blocks.push({ kind: "code", language: fence[2], text: code.join("\n") });
      continue;
    }
    i++;
    if (!line) continue;
    const heading = HEADING.exec(line);
    const bullet = BULLET.exec(line);
    const numbered = NUMBERED.exec(line);
    const last = blocks[blocks.length - 1];
    const adjacent = lines[i - 2]?.trim() !== "";
    if (heading) blocks.push({ kind: "heading", level: heading[1].length, text: heading[2] });
    else if (RULE.test(line)) blocks.push({ kind: "rule" });
    else if (bullet || numbered) {
      const ordered = !bullet;
      const item = itemOf((bullet ?? numbered)![1]);
      if (adjacent && last?.kind === "list" && last.ordered === ordered) last.items.push(item);
      else blocks.push({ kind: "list", ordered, items: [item] });
    } else if (line.startsWith(">")) {
      const text = line.replace(/^>\s?/, "");
      if (adjacent && last?.kind === "quote") last.text += ` ${text}`;
      else blocks.push({ kind: "quote", text });
    } else if (adjacent && last?.kind === "paragraph") last.text += ` ${line}`;
    else blocks.push({ kind: "paragraph", text: line });
  }
  return blocks;
}

/** The address as the browser reads it, http or https only: `javascript:` and `file:` never reach the opener. */
export function safeUrl(raw: string): string | null {
  if (/\s/.test(raw)) return null;
  try {
    const url = new URL(raw);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}

const INLINE = /`([^`\n]+)`|\[\[([^[\]\n]+)\]\]|\[([^\]\n]+)\]\(([^\s]+)\)|\*\*([^*\n]+)\*\*|~~([^~\n]+)~~|(?<![\w*])\*([^\s*](?:[^*\n]*[^\s*])?)\*(?![\w*])|https?:\/\/[^\s)]*[^\s).,;:!?'"]/g;

/** One line's spans; whatever is not understood stays plain text. */
export function parseInline(text: string): Inline[] {
  const spans: Inline[] = [];
  const plain = (value: string) => {
    if (!value) return;
    const last = spans[spans.length - 1];
    if (last?.kind === "text") last.text += value;
    else spans.push({ kind: "text", text: value });
  };
  let at = 0;
  for (const match of text.matchAll(INLINE)) {
    plain(text.slice(at, match.index));
    at = match.index + match[0].length;
    const [whole, code, wikilink, label, target, strong, strike, em] = match;
    const link = wikilink === undefined ? null : readLink(wikilink);
    const url = target === undefined ? (whole.startsWith("http") ? safeUrl(whole) : null) : safeUrl(target);
    if (code !== undefined) spans.push({ kind: "code", text: code });
    else if (link) spans.push({ kind: "wikilink", ...link });
    else if (url && target === undefined) spans.push({ kind: "link", url: whole, label: whole });
    else if (url) spans.push({ kind: "link", url: target, label });
    else if (strong !== undefined) spans.push({ kind: "strong", text: strong });
    else if (strike !== undefined) spans.push({ kind: "strike", text: strike });
    else if (em !== undefined) spans.push({ kind: "em", text: em });
    else plain(whole);
  }
  plain(text.slice(at));
  return spans;
}
