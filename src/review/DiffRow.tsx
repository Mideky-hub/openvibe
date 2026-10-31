import type { ChangedFile } from "@/ipc/review";
import { useMessages } from "@/i18n";
import { cn } from "@/lib/utils";
import { reviewMessages } from "./messages";
import type { DiffLine } from "./review";

/** A diff or a file longer than this shows its start only. */
export const MAX_LINES = 4000;

/** Letter and color of a changed file, in the review panel and the git window. */
export const FILE_STATUS: Record<ChangedFile["status"], { letter: string; color: string }> = {
  added: { letter: "A", color: "var(--ov-ok)" },
  untracked: { letter: "N", color: "var(--ov-ok)" },
  modified: { letter: "M", color: "var(--ov-accent)" },
  deleted: { letter: "D", color: "var(--ov-danger)" },
  renamed: { letter: "R", color: "var(--ov-wait)" },
};

const ROW_COLOR: Partial<Record<DiffLine["kind"], string>> = {
  add: "color-mix(in srgb, var(--ov-ok) 16%, transparent)",
  del: "color-mix(in srgb, var(--ov-danger) 16%, transparent)",
};

/** One line of a diff; `onClick` makes it take a remark, without it the diff is read-only. */
export function DiffRow({ line, onClick }: { line: DiffLine; onClick?: () => void }) {
  const t = useMessages(reviewMessages);
  if (line.kind === "hunk" || line.kind === "meta") {
    return (
      <div data-diff-line={line.kind} className="bg-ov-field px-3 text-ov-text-3">
        {line.text}
      </div>
    );
  }
  return (
    <div
      data-diff-line={line.kind}
      onClick={onClick}
      title={onClick ? t.rowTitle : undefined}
      className={cn("flex", onClick && "cursor-pointer hover:brightness-125")}
      style={{ backgroundColor: ROW_COLOR[line.kind] }}
    >
      <span className="w-10 shrink-0 select-none pr-1 text-right text-ov-text-3">{line.old ?? ""}</span>
      <span className="w-10 shrink-0 select-none pr-1 text-right text-ov-text-3">{line.new ?? ""}</span>
      <span className="w-4 shrink-0 select-none text-center text-ov-text-3">{line.kind === "add" ? "+" : line.kind === "del" ? "−" : ""}</span>
      <span className="whitespace-pre pr-3 text-ov-text">{line.text}</span>
    </div>
  );
}
