import type { ReactNode } from "react";

type Block = { kind: "heading"; text: string } | { kind: "list"; items: string[] } | { kind: "paragraph"; text: string };

/** The few Markdown shapes release notes use: headings, bullet lists, paragraphs. */
export function parseNotes(source: string): Block[] {
  const blocks: Block[] = [];
  for (const raw of source.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const heading = /^#{1,6}\s+(.*)$/.exec(line);
    const item = /^[-*+]\s+(.*)$/.exec(line);
    const last = blocks[blocks.length - 1];
    if (heading) blocks.push({ kind: "heading", text: heading[1] });
    else if (item) {
      if (last?.kind === "list") last.items.push(item[1]);
      else blocks.push({ kind: "list", items: [item[1]] });
    } else blocks.push({ kind: "paragraph", text: line });
  }
  return blocks;
}

/** `**bold**` and `` `code` `` inside a line. */
function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`)/).map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) return <strong key={i}>{part.slice(2, -2)}</strong>;
    if (part.startsWith("`") && part.endsWith("`") && part.length > 2) return <code key={i}>{part.slice(1, -1)}</code>;
    return part;
  });
}

export function ReleaseNotes({ notes }: { notes: string }) {
  return (
    <div className="max-h-48 overflow-auto rounded bg-ov-card p-2 text-[12px] text-ov-text-2">
      {parseNotes(notes).map((block, i) =>
        block.kind === "heading" ? (
          <h4 key={i} className="mt-1 font-semibold text-ov-text first:mt-0">
            {inline(block.text)}
          </h4>
        ) : block.kind === "list" ? (
          <ul key={i} className="list-disc pl-4">
            {block.items.map((item, j) => (
              <li key={j}>{inline(item)}</li>
            ))}
          </ul>
        ) : (
          <p key={i}>{inline(block.text)}</p>
        ),
      )}
    </div>
  );
}
