import type { ReactNode } from "react";

/** Inline code, bold, italic and http(s) links; everything else is plain text, never HTML. */
const INLINE = /`([^`]+)`|\*\*([^*]+)\*\*|\*([^*]+)\*|\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;

function inline(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(INLINE)) {
    if (m.index > last) out.push(text.slice(last, m.index));
    if (m[1] !== undefined) out.push(<code key={m.index} className="rounded bg-muted px-1 font-mono text-[0.9em]">{m[1]}</code>);
    else if (m[2] !== undefined) out.push(<strong key={m.index}>{m[2]}</strong>);
    else if (m[3] !== undefined) out.push(<em key={m.index}>{m[3]}</em>);
    else out.push(<a key={m.index} href={m[5]} target="_blank" rel="noreferrer noopener" className="underline">{m[4]}</a>);
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

const LIST_ITEM = /^\s*([-*+]|\d+\.)\s+/;

/** A small, safe Markdown: headings, lists, quotes, code blocks, paragraphs. Raw HTML stays text. */
export function Markdown({ source }: { source: string }) {
  const blocks: ReactNode[] = [];
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const key = blocks.length;
    if (line.trim() === "") {
      i++;
    } else if (line.startsWith("```")) {
      const code: string[] = [];
      for (i++; i < lines.length && !lines[i].startsWith("```"); i++) code.push(lines[i]);
      i++;
      blocks.push(<pre key={key} className="overflow-auto rounded bg-muted p-2 font-mono text-xs">{code.join("\n")}</pre>);
    } else if (/^#{1,6}\s/.test(line)) {
      const level = line.indexOf(" ");
      const size = level === 1 ? "text-xl" : level === 2 ? "text-lg" : "text-base";
      blocks.push(<p key={key} className={`${size} font-semibold`}>{inline(line.slice(level + 1))}</p>);
      i++;
    } else if (LIST_ITEM.test(line)) {
      const ordered = /^\s*\d+\./.test(line);
      const items: ReactNode[] = [];
      for (; i < lines.length && LIST_ITEM.test(lines[i]); i++) items.push(<li key={i}>{inline(lines[i].replace(LIST_ITEM, ""))}</li>);
      blocks.push(ordered ? <ol key={key} className="list-decimal pl-5">{items}</ol> : <ul key={key} className="list-disc pl-5">{items}</ul>);
    } else if (line.startsWith(">")) {
      const quote: string[] = [];
      for (; i < lines.length && lines[i].startsWith(">"); i++) quote.push(lines[i].replace(/^>\s?/, ""));
      blocks.push(<blockquote key={key} className="border-l-2 pl-3 text-muted-foreground">{inline(quote.join(" "))}</blockquote>);
    } else {
      const para = [line];
      for (i++; i < lines.length && lines[i].trim() !== "" && !/^(```|#{1,6}\s|>)/.test(lines[i]) && !LIST_ITEM.test(lines[i]); i++) para.push(lines[i]);
      blocks.push(<p key={key}>{inline(para.join(" "))}</p>);
    }
  }
  return <div className="space-y-2 text-sm leading-relaxed">{blocks}</div>;
}
