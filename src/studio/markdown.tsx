import type { ReactNode } from "react";

/**
 * Small, safe Markdown renderer producing React elements.
 * Never uses innerHTML: raw HTML in the source is shown as literal text.
 */

const FENCE = /^\s*```\s*([\w+#.-]*)\s*$/;
const HEADING = /^(#{1,6})\s+(.*?)\s*#*\s*$/;
const HR = /^\s*([-*_])(\s*\1){2,}\s*$/;
const QUOTE = /^\s*>\s?(.*)$/;
const UL = /^\s*[-*+]\s+(.*)$/;
const OL = /^\s*\d+[.)]\s+(.*)$/;
const TABLE_SEP = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/;
const INLINE =
  /`([^`]+)`|!\[([^\]]*)\]\(([^)\s]*)\)|\[([^\]]+)\]\(([^)\s]*)\)|\*\*(.+?)\*\*|__(.+?)__|\*([^*\s][^*]*?)\*|\b_([^_\s][^_]*?)_\b/g;

const HEADING_CLASSES = [
  "text-xl font-semibold",
  "text-lg font-semibold",
  "text-base font-semibold",
  "text-sm font-semibold",
  "text-sm font-medium",
  "text-sm font-medium text-ov-text-2",
];

/** Returns the href if it is http(s), mailto or relative; otherwise null. */
export function safeHref(raw: string): string | null {
  const href = raw.trim();
  // Strip whitespace and control chars so "java\tscript:" cannot sneak through.
  const compact = href.replace(/[\u0000- ]/g, "").toLowerCase();
  const scheme = /^([a-z][a-z0-9+.-]*):/.exec(compact);
  if (!scheme) return href;
  return ["http", "https", "mailto"].includes(scheme[1]) ? href : null;
}

/** Renders inline formatting: code, bold, italic, links, images (as text). */
function renderInline(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let key = 0;
  for (const m of text.matchAll(INLINE)) {
    const start = m.index ?? 0;
    if (start > last) out.push(text.slice(last, start));
    last = start + m[0].length;
    const k = key++;
    if (m[1] !== undefined) {
      out.push(
        <code key={k} className="rounded bg-ov-field px-1 font-mono text-[0.9em]">
          {m[1]}
        </code>,
      );
    } else if (m[2] !== undefined) {
      out.push(<span key={k} className="text-ov-text-3">[{m[2] || "image"}]</span>);
    } else if (m[4] !== undefined) {
      const href = safeHref(m[5]);
      out.push(
        href === null ? (
          <span key={k}>{renderInline(m[4])}</span>
        ) : (
          <a
            key={k}
            href={href}
            target="_blank"
            rel="noreferrer noopener"
            className="text-ov-accent underline"
          >
            {renderInline(m[4])}
          </a>
        ),
      );
    } else if (m[6] !== undefined || m[7] !== undefined) {
      out.push(<strong key={k}>{renderInline(m[6] ?? m[7])}</strong>);
    } else {
      out.push(<em key={k}>{renderInline(m[8] ?? m[9])}</em>);
    }
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/** Splits a table row into trimmed cells, ignoring outer pipes. */
function splitRow(line: string): string[] {
  return line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
}

/** True when a line starts a non-paragraph block. */
function startsBlock(line: string, next: string | undefined): boolean {
  return (
    FENCE.test(line) || HEADING.test(line) || HR.test(line) || QUOTE.test(line) ||
    UL.test(line) || OL.test(line) || (line.includes("|") && next !== undefined && TABLE_SEP.test(next))
  );
}

/** Renders a Markdown string as React nodes. */
export function renderMarkdown(source: string): ReactNode {
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const key = blocks.length;
    let m: RegExpExecArray | null;
    if (!line.trim()) {
      i++;
    } else if ((m = FENCE.exec(line))) {
      const code: string[] = [];
      i++;
      while (i < lines.length && !/^\s*```\s*$/.test(lines[i])) code.push(lines[i++]);
      i++;
      blocks.push(
        <pre key={key} className="overflow-x-auto rounded border border-ov-line bg-ov-field p-2">
          <code className="font-mono text-xs" data-lang={m[1] || undefined}>
            {code.join("\n")}
          </code>
        </pre>,
      );
    } else if ((m = HEADING.exec(line))) {
      const level = m[1].length;
      const Tag = `h${level}` as "h1";
      blocks.push(<Tag key={key} className={`text-ov-text ${HEADING_CLASSES[level - 1]}`}>{renderInline(m[2])}</Tag>);
      i++;
    } else if (HR.test(line)) {
      blocks.push(<hr key={key} className="border-ov-line" />);
      i++;
    } else if (QUOTE.test(line)) {
      const inner: string[] = [];
      while (i < lines.length && (m = QUOTE.exec(lines[i]))) {
        inner.push(m[1]);
        i++;
      }
      blocks.push(
        <blockquote key={key} className="border-l-2 border-ov-line pl-3 text-ov-text-2">
          {renderMarkdown(inner.join("\n"))}
        </blockquote>,
      );
    } else if (UL.test(line) || OL.test(line)) {
      const ordered = OL.test(line);
      const re = ordered ? OL : UL;
      const items: string[] = [];
      while (i < lines.length && (m = re.exec(lines[i]))) {
        items.push(m[1]);
        i++;
      }
      const children = items.map((item, n) => <li key={n}>{renderInline(item)}</li>);
      blocks.push(
        ordered ? (
          <ol key={key} className="list-decimal pl-5">{children}</ol>
        ) : (
          <ul key={key} className="list-disc pl-5">{children}</ul>
        ),
      );
    } else if (line.includes("|") && i + 1 < lines.length && TABLE_SEP.test(lines[i + 1])) {
      const head = splitRow(line);
      const rows: string[][] = [];
      i += 2;
      while (i < lines.length && lines[i].includes("|") && lines[i].trim()) rows.push(splitRow(lines[i++]));
      blocks.push(
        <table key={key} className="border-collapse text-sm">
          <thead>
            <tr>{head.map((c, n) => <th key={n} className="border border-ov-line px-2 py-1 text-left">{renderInline(c)}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((row, r) => (
              <tr key={r}>{row.map((c, n) => <td key={n} className="border border-ov-line px-2 py-1">{renderInline(c)}</td>)}</tr>
            ))}
          </tbody>
        </table>,
      );
    } else {
      const para: string[] = [line];
      i++;
      while (i < lines.length && lines[i].trim() && !startsBlock(lines[i], lines[i + 1])) para.push(lines[i++]);
      blocks.push(<p key={key}>{renderInline(para.join(" "))}</p>);
    }
  }
  return <div className="flex flex-col gap-2 text-sm text-ov-text">{blocks}</div>;
}
