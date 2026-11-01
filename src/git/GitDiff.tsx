import { useEffect, useState, type ReactNode } from "react";
import { useMessages } from "@/i18n";
import { reviewFileDiff, type ChangedFile } from "@/ipc/review";
import { DiffRow, MAX_LINES } from "@/review/DiffRow";
import { reviewMessages } from "@/review/messages";
import { parseDiff, type DiffLine } from "@/review/review";

export function GitMessage({ children }: { children: ReactNode }) {
  return <p className="grid flex-1 place-items-center p-6 text-center text-xs text-ov-text-2">{children}</p>;
}

/** A file's changes against HEAD, read-only: the review panel's rows, without its remarks. */
export function GitDiff({ path, file, refresh }: { path: string; file: ChangedFile; refresh: number }) {
  const t = useMessages(reviewMessages);
  const [diff, setDiff] = useState<{ lines: DiffLine[]; binary: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    reviewFileDiff(path, file, null).then(
      (text) => {
        if (!alive) return;
        setError(null);
        setDiff(parseDiff(text));
      },
      (failure: unknown) => alive && setError(String(failure)),
    );
    return () => {
      alive = false;
    };
  }, [path, file, refresh]);

  if (error) return <GitMessage>{error}</GitMessage>;
  if (!diff) return <GitMessage>{t.readingDiff}</GitMessage>;
  if (diff.binary) return <GitMessage>{t.binaryNoDiff}</GitMessage>;
  if (diff.lines.length === 0) return <GitMessage>{t.noContentDiff}</GitMessage>;
  return (
    <div className="min-w-0 flex-1 overflow-auto font-mono text-[12px] leading-[18px]">
      {diff.lines.slice(0, MAX_LINES).map((line, i) => (
        <DiffRow key={i} line={line} />
      ))}
      {diff.lines.length > MAX_LINES && <p className="px-3 py-2 font-sans text-xs text-ov-text-2">{t.moreLines(diff.lines.length - MAX_LINES)}</p>}
    </div>
  );
}
