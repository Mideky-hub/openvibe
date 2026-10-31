import { useMemo } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useMessages } from "@/i18n";
import { cn } from "@/lib/utils";
import { noteNamed } from "./links";
import { parseInline, parseMarkdown, type Block } from "./markdown";
import { notesMessages } from "./messages";

interface Props {
  text: string;
  notes: readonly { name: string }[];
  /** A wikilink to an existing note. */
  onOpen: (name: string) => void;
  /** A wikilink to a note that does not exist yet. */
  onCreate: (name: string) => void;
}

const HEADINGS = ["text-[20px]", "text-[17px]", "text-[15px]", "text-[13px]", "text-[13px]", "text-[13px]"];

/** A note, read: elements built by React from the parsed text, never HTML (spec notes §3). */
export function NoteReader({ text, notes, onOpen, onCreate }: Props) {
  const t = useMessages(notesMessages);
  const blocks = useMemo(() => parseMarkdown(text), [text]);

  const line = (source: string) =>
    parseInline(source).map((span, i) => {
      switch (span.kind) {
        case "text":
          return span.text;
        case "strong":
          return <strong key={i}>{span.text}</strong>;
        case "em":
          return <em key={i}>{span.text}</em>;
        case "strike":
          return <s key={i}>{span.text}</s>;
        case "code":
          return (
            <code key={i} className="rounded-[4px] bg-ov-field px-1 font-mono text-[11.5px]">
              {span.text}
            </code>
          );
        case "link":
          return (
            <button key={i} type="button" title={span.url} onClick={() => void openUrl(span.url)} className="text-ov-accent underline underline-offset-2">
              {span.label}
            </button>
          );
        case "wikilink": {
          const target = noteNamed(notes, span.target);
          return (
            <button
              key={i}
              type="button"
              title={target ? target.name : t.deadLink(span.target)}
              onClick={() => (target ? onOpen(target.name) : onCreate(span.target))}
              className={cn("underline underline-offset-2", target ? "text-ov-accent" : "text-ov-text-3 decoration-dotted")}
            >
              {span.label}
            </button>
          );
        }
      }
    });

  const block = (item: Block, i: number) => {
    switch (item.kind) {
      case "heading": {
        const Heading = `h${item.level}` as "h1";
        return (
          <Heading key={i} className={cn("mt-4 font-semibold text-ov-text first:mt-0", HEADINGS[item.level - 1])}>
            {line(item.text)}
          </Heading>
        );
      }
      case "paragraph":
        return <p key={i}>{line(item.text)}</p>;
      case "quote":
        return (
          <blockquote key={i} className="border-l-2 border-ov-accent pl-3 text-ov-text-2">
            {line(item.text)}
          </blockquote>
        );
      case "rule":
        return <hr key={i} className="border-ov-line" />;
      case "code":
        return (
          <pre key={i} className="overflow-x-auto rounded-[9px] bg-ov-field p-3 font-mono text-[11.5px] leading-[18px]">
            <code>{item.text}</code>
          </pre>
        );
      case "list": {
        const List = item.ordered ? "ol" : "ul";
        return (
          <List key={i} className={cn("pl-5", item.ordered ? "list-decimal" : "list-disc")}>
            {item.items.map((entry, j) => (
              <li key={j} className={cn(entry.checked !== undefined && "list-none")}>
                {entry.checked !== undefined && <input type="checkbox" checked={entry.checked} disabled readOnly className="mr-1.5 -ml-4 accent-ov-accent" />}
                {line(entry.text)}
              </li>
            ))}
          </List>
        );
      }
    }
  };

  return (
    <div data-reader className="min-h-0 min-w-0 flex-1 overflow-y-auto px-6 py-5">
      {blocks.length === 0 ? (
        <p className="text-xs text-ov-text-3">{t.emptyNote}</p>
      ) : (
        <div className="mx-auto flex max-w-[720px] flex-col gap-2.5 text-[13px] leading-[1.6] text-ov-text">{blocks.map(block)}</div>
      )}
    </div>
  );
}
