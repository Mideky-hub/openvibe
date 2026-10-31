import { useEffect, useState, type ReactNode } from "react";
import { FileDiff, RotateCw, X } from "lucide-react";
import { toast } from "sonner";
import { sendToAgents } from "@/fleet/broadcast";
import { AGENTS } from "@/fleet/catalog";
import { reviewChanges, reviewDefaultBase, reviewFileDiff, reviewFiles, reviewReadFile, type ChangedFile, type FileText } from "@/ipc/review";
import { cn } from "@/lib/utils";
import { BOTTOM_BAR_HEIGHT, TOP_ROW_HEIGHT } from "@/shell/layout";
import { messages, useMessages } from "@/i18n";
import { AccentButton, IconButton } from "@/shell/buttons";
import { sessionOf, useNodes } from "@/store/nodes";
import { missionBranchFor, parseDiff, remarkRow, reviewMessage, type DiffLine, type Remark } from "./review";
import { reviewMessages } from "./messages";
import { reviewStore, useReview } from "./reviewStore";

/** A diff or a file longer than this shows its start only. */
const MAX_LINES = 4000;
/** The files tab lists this many paths at most; the filter finds the others. */
const MAX_FILES = 400;

const STATUS: Record<ChangedFile["status"], { letter: string; color: string }> = {
  added: { letter: "A", color: "var(--ov-ok)" },
  untracked: { letter: "N", color: "var(--ov-ok)" },
  modified: { letter: "M", color: "var(--ov-accent)" },
  deleted: { letter: "D", color: "var(--ov-danger)" },
  renamed: { letter: "R", color: "var(--ov-wait)" },
};

/** The panel's own toasts show at the top: the default corner is where « Envoyer » is. */
const TOAST_AWAY = { position: "top-center" } as const;

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** What an agent changed and its folder's files, with remarks sent back to it (spec maj §5). */
export function ReviewPanel() {
  const nodeId = useReview((s) => s.nodeId);
  return nodeId ? <ReviewDrawer key={nodeId} nodeId={nodeId} /> : null;
}

function ReviewDrawer({ nodeId }: { nodeId: string }) {
  const t = useMessages(reviewMessages);
  const session = useNodes((s) => sessionOf(s.nodes[nodeId]));
  const [tab, setTab] = useState<"changes" | "files">("changes");
  // undefined while it is looked for; null: none, the work is compared with HEAD only.
  const [base, setBase] = useState<string | null | undefined>(undefined);
  const [sinceBase, setSinceBase] = useState(true);
  const [refresh, setRefresh] = useState(0);
  const cwd = session?.cwd;

  useEffect(() => {
    if (!cwd) return;
    let alive = true;
    const mission = missionBranchFor(nodeId);
    if (mission) setBase(mission);
    else reviewDefaultBase(cwd).then((found) => alive && setBase(found), () => alive && setBase(null));
    return () => {
      alive = false;
    };
  }, [nodeId, cwd]);

  useEffect(() => {
    // An Escape a menu, a dialog or a field already used is theirs (final review maj §5).
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target?.isContentEditable === true;
      if (e.key === "Escape" && !e.defaultPrevented && !typing) reviewStore.getState().close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (!session || !cwd) return null;
  const name = session.name || AGENTS[session.agent].label;
  const compared = sinceBase && base ? base : null;
  return (
    <aside
      data-review={nodeId}
      className="ov-glass-strong absolute right-[72px] z-20 flex w-[min(920px,calc(100vw-180px))] flex-col overflow-hidden rounded-[14px] text-ov-text"
      style={{ top: TOP_ROW_HEIGHT + 14, bottom: BOTTOM_BAR_HEIGHT + 14 }}
    >
      <header className="flex h-10 shrink-0 items-center gap-2 border-b border-ov-line px-3">
        <FileDiff className="size-4 shrink-0 text-ov-accent" />
        <span className="shrink-0 text-[13px] font-semibold">{t.title(name)}</span>
        <span className="min-w-0 truncate font-mono text-[11px] text-ov-text-3" title={cwd}>
          {cwd}
        </span>
        <span className="ml-auto flex shrink-0 items-center gap-0.5">
          <IconButton label={t.refresh} onClick={() => setRefresh((n) => n + 1)}>
            <RotateCw />
          </IconButton>
          <IconButton label={t.close} onClick={() => reviewStore.getState().close()}>
            <X />
          </IconButton>
        </span>
      </header>
      <div className="flex h-9 shrink-0 items-center gap-1 border-b border-ov-line px-2">
        <Tab active={tab === "changes"} onClick={() => setTab("changes")}>
          {t.tabChanges}
        </Tab>
        <Tab active={tab === "files"} onClick={() => setTab("files")}>
          {t.tabFiles}
        </Tab>
        {tab === "changes" && base && (
          <span className="ml-auto flex items-center gap-1">
            <Tab active={!sinceBase} onClick={() => setSinceBase(false)}>
              {t.uncommitted}
            </Tab>
            <Tab active={sinceBase} onClick={() => setSinceBase(true)}>
              {t.since(base)}
            </Tab>
          </span>
        )}
      </div>
      {base === undefined ? (
        <Message>{t.readingRepo}</Message>
      ) : tab === "changes" ? (
        <ChangesTab key={`${cwd}:${compared}`} cwd={cwd} base={compared} refresh={refresh} />
      ) : (
        <FilesTab key={cwd} cwd={cwd} refresh={refresh} />
      )}
      <Remarks nodeId={nodeId} name={name} />
    </aside>
  );
}

function Tab({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn("rounded-full px-2.5 py-0.5 text-[12px] text-ov-text-2 hover:text-ov-text", active && "bg-ov-accent-soft text-ov-text")}
    >
      {children}
    </button>
  );
}

function Message({ children }: { children: ReactNode }) {
  return <p className="grid flex-1 place-items-center p-6 text-center text-xs text-ov-text-2">{children}</p>;
}

function ChangesTab({ cwd, base, refresh }: { cwd: string; base: string | null; refresh: number }) {
  const t = useMessages(reviewMessages);
  const [files, setFiles] = useState<ChangedFile[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<ChangedFile | null>(null);
  const [cut, setCut] = useState(false);

  useEffect(() => {
    let alive = true;
    reviewChanges(cwd, base).then(
      (changes) => {
        if (!alive) return;
        setCut(changes.truncated === true);
        setError(null);
        setFiles(changes.files);
        // A refresh stays on the file being read when it is still changed.
        setSelected((current) => changes.files.find((f) => f.path === current?.path) ?? changes.files[0] ?? null);
      },
      (failure: unknown) => alive && setError(errorText(failure)),
    );
    return () => {
      alive = false;
    };
  }, [cwd, base, refresh]);

  if (error) return <Message>{error}</Message>;
  if (!files) return <Message>{t.readingChanges}</Message>;
  if (files.length === 0) return <Message>{base ? t.noChangesSince(base) : t.noChanges}</Message>;
  return (
    <div className="flex min-h-0 flex-1">
      <ul className="w-[260px] shrink-0 overflow-y-auto border-r border-ov-line py-1">
        {cut && <li className="px-3 py-1 text-[11px] text-ov-text-3">{t.listCut(files.length)}</li>}
        {files.map((file) => {
          const status = STATUS[file.status];
          return (
            <li key={file.path}>
              <button
                type="button"
                title={`${file.oldPath ? `${file.oldPath} → ` : ""}${file.path} · ${t.status[file.status]}`}
                onClick={() => setSelected(file)}
                className={cn(
                  "flex w-full items-center gap-2 px-3 py-1 text-left text-[12px] text-ov-text-2 hover:bg-ov-hover",
                  selected?.path === file.path && "bg-ov-hover text-ov-text",
                )}
              >
                <span className="w-3 shrink-0 font-mono text-[11px] font-semibold" style={{ color: status.color }}>
                  {status.letter}
                </span>
                <span className="min-w-0 flex-1 truncate" style={{ direction: "rtl", textAlign: "left" }}>
                  {file.path}
                </span>
                {file.added === null ? (
                  <span className="shrink-0 text-[11px] text-ov-text-3" title={t.binaryOrBig}>
                    —
                  </span>
                ) : (
                  <span className="shrink-0 font-mono text-[11px]">
                    <span style={{ color: "var(--ov-ok)" }}>+{file.added}</span> <span style={{ color: "var(--ov-danger)" }}>−{file.removed}</span>
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
      {selected ? <FileDiffView key={selected.path} cwd={cwd} file={selected} base={base} refresh={refresh} /> : <Message>{t.pickFile}</Message>}
    </div>
  );
}

function FileDiffView({ cwd, file, base, refresh }: { cwd: string; file: ChangedFile; base: string | null; refresh: number }) {
  const t = useMessages(reviewMessages);
  const [diff, setDiff] = useState<{ lines: DiffLine[]; binary: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [commenting, setCommenting] = useState<number | null>(null);
  // The remark being typed follows the click to another line instead of being lost.
  const [draft, setDraft] = useState("");
  const remarks = useReview((s) => s.remarks);

  useEffect(() => {
    let alive = true;
    reviewFileDiff(cwd, file, base).then(
      (text) => {
        if (!alive) return;
        setError(null);
        setDiff(parseDiff(text));
      },
      (failure: unknown) => alive && setError(errorText(failure)),
    );
    return () => {
      alive = false;
    };
  }, [cwd, file, base, refresh]);

  if (error) return <Message>{error}</Message>;
  if (!diff) return <Message>{t.readingDiff}</Message>;
  if (diff.binary) return <Message>{t.binaryNoDiff}</Message>;
  if (diff.lines.length === 0) return <Message>{t.noContentDiff}</Message>;
  const shown = diff.lines.slice(0, MAX_LINES);
  const here = remarks.filter((r) => r.file === file.path && r.line !== undefined);
  const placed = here.map((r) => remarkRow(shown, r));
  const remarkFor = (row: number) => here.filter((_, k) => placed[k] === row);
  return (
    <div className="min-w-0 flex-1 overflow-auto font-mono text-[12px] leading-[18px]">
      {shown.map((line, i) => (
        <div key={i}>
          <DiffRow line={line} onClick={line.kind === "add" || line.kind === "ctx" || line.kind === "del" ? () => setCommenting(i) : undefined} />
          {remarkFor(i).map((remark, j) => (
            <p key={j} className="ml-[88px] border-l-2 border-ov-accent bg-ov-card px-2 py-0.5 font-sans text-[12px] text-ov-text">
              {remark.text}
            </p>
          ))}
          {commenting === i && (
            <RemarkField
              value={draft}
              onChange={setDraft}
              onDone={(text) => {
                setCommenting(null);
                setDraft("");
                if (!text) return;
                const remark: Remark =
                  line.kind === "del"
                    ? { file: file.path, line: line.old, side: "old", lineText: line.text, text }
                    : { file: file.path, line: line.new, lineText: line.text, text };
                reviewStore.getState().add(remark);
              }}
            />
          )}
        </div>
      ))}
      {diff.lines.length > MAX_LINES && <p className="px-3 py-2 font-sans text-xs text-ov-text-2">{t.moreLines(diff.lines.length - MAX_LINES)}</p>}
    </div>
  );
}

const ROW_COLOR: Partial<Record<DiffLine["kind"], string>> = {
  add: "color-mix(in srgb, var(--ov-ok) 16%, transparent)",
  del: "color-mix(in srgb, var(--ov-danger) 16%, transparent)",
};

function DiffRow({ line, onClick }: { line: DiffLine; onClick?: () => void }) {
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
      title={t.rowTitle}
      className="flex cursor-pointer hover:brightness-125"
      style={{ backgroundColor: ROW_COLOR[line.kind] }}
    >
      <span className="w-10 shrink-0 select-none pr-1 text-right text-ov-text-3">{line.old ?? ""}</span>
      <span className="w-10 shrink-0 select-none pr-1 text-right text-ov-text-3">{line.new ?? ""}</span>
      <span className="w-4 shrink-0 select-none text-center text-ov-text-3">{line.kind === "add" ? "+" : line.kind === "del" ? "−" : ""}</span>
      <span className="whitespace-pre pr-3 text-ov-text">{line.text}</span>
    </div>
  );
}

function RemarkField({ value: text, onChange: setText, onDone }: { value: string; onChange: (text: string) => void; onDone: (text: string) => void }) {
  const t = useMessages(reviewMessages);
  return (
    <div className="ml-[88px] flex items-center gap-2 py-1 pr-3 font-sans">
      <input
        autoFocus
        aria-label={t.remarkLabel}
        placeholder={t.remarkPlaceholder}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") onDone(text.trim());
          if (e.key === "Escape") onDone("");
        }}
        className="h-7 flex-1 rounded-[6px] bg-ov-field px-2 text-[12px] text-ov-text outline-none placeholder:text-ov-text-3"
      />
    </div>
  );
}

function FilesTab({ cwd, refresh }: { cwd: string; refresh: number }) {
  const t = useMessages(reviewMessages);
  const [files, setFiles] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    reviewFiles(cwd).then(
      (list) => alive && setFiles(list),
      (failure: unknown) => alive && setError(errorText(failure)),
    );
    return () => {
      alive = false;
    };
  }, [cwd, refresh]);

  if (error) return <Message>{error}</Message>;
  if (!files) return <Message>{t.readingFiles}</Message>;
  const wanted = filter.trim().toLowerCase();
  const found = (wanted ? files.filter((f) => f.toLowerCase().includes(wanted)) : files).slice(0, MAX_FILES);
  return (
    <div className="flex min-h-0 flex-1">
      <div className="flex w-[260px] shrink-0 flex-col border-r border-ov-line">
        <input
          aria-label={t.filterLabel}
          placeholder={t.filterPlaceholder(files.length)}
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="m-2 h-7 rounded-[6px] bg-ov-field px-2 text-[12px] text-ov-text outline-none placeholder:text-ov-text-3"
        />
        <ul className="min-h-0 flex-1 overflow-y-auto pb-1">
          {found.map((file) => (
            <li key={file}>
              <button
                type="button"
                title={file}
                onClick={() => setSelected(file)}
                className={cn(
                  "block w-full truncate px-3 py-0.5 text-left text-[12px] text-ov-text-2 hover:bg-ov-hover",
                  selected === file && "bg-ov-hover text-ov-text",
                )}
                style={{ direction: "rtl", textAlign: "left" }}
              >
                {file}
              </button>
            </li>
          ))}
        </ul>
      </div>
      {selected ? <FileView key={selected} cwd={cwd} file={selected} /> : <Message>{t.pickFile}</Message>}
    </div>
  );
}

function FileView({ cwd, file }: { cwd: string; file: string }) {
  const t = useMessages(reviewMessages);
  const [content, setContent] = useState<FileText | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    reviewReadFile(cwd, file).then(
      (read) => alive && setContent(read),
      (failure: unknown) => alive && setError(errorText(failure)),
    );
    return () => {
      alive = false;
    };
  }, [cwd, file]);

  if (error) return <Message>{error}</Message>;
  if (!content) return <Message>{t.readingFile}</Message>;
  if (content.text === null) return <Message>{t.binaryFile(content.size)}</Message>;
  const lines = content.text.split("\n");
  if (lines[lines.length - 1] === "") lines.pop();
  return (
    <div className="min-w-0 flex-1 overflow-auto font-mono text-[12px] leading-[18px]">
      {lines.slice(0, MAX_LINES).map((line, i) => (
        <div key={i} className="flex">
          <span className="w-12 shrink-0 select-none pr-2 text-right text-ov-text-3">{i + 1}</span>
          <span className="whitespace-pre pr-3 text-ov-text">{line}</span>
        </div>
      ))}
      {(content.truncated || lines.length > MAX_LINES) && <p className="px-3 py-2 font-sans text-xs text-ov-text-2">{t.longFile}</p>}
    </div>
  );
}

/** The remarks waiting to be sent, under the panel. */
function Remarks({ nodeId, name }: { nodeId: string; name: string }) {
  const t = useMessages(reviewMessages);
  const remarks = useReview((s) => s.remarks);
  if (remarks.length === 0) return null;
  const send = async () => {
    const { sent, skipped, waiting, starting } = await sendToAgents([nodeId], reviewMessage(remarks));
    if (sent > 0) {
      reviewStore.getState().clear();
      toast(messages(reviewMessages).sent(name), TOAST_AWAY);
    } else if (waiting.length > 0) toast.warning(messages(reviewMessages).waiting(name), TOAST_AWAY);
    else if (starting.length > 0) toast.warning(messages(reviewMessages).starting(name));
    else if (skipped.length > 0) toast.warning(messages(reviewMessages).stopped(name), TOAST_AWAY);
  };
  return (
    <footer className="flex max-h-[30%] shrink-0 flex-col gap-1.5 border-t border-ov-line px-3 py-2">
      <ul className="flex min-h-0 flex-col gap-0.5 overflow-y-auto text-[12px]">
        {remarks.map((remark, i) => (
          <li key={i} className="flex items-center gap-2 text-ov-text-2">
            <span className="shrink-0 font-mono text-[11px] text-ov-text-3">
              {remark.file}
              {remark.line !== undefined ? `:${remark.line}` : ""}
            </span>
            <span className="min-w-0 flex-1 truncate text-ov-text">{remark.text}</span>
            <IconButton label={t.removeRemark} onClick={() => reviewStore.getState().remove(i)}>
              <X />
            </IconButton>
          </li>
        ))}
      </ul>
      <div className="flex items-center gap-2">
        <span className="text-[12px] text-ov-text-2">
          {t.remarkCount(remarks.length)}
        </span>
        <button type="button" onClick={() => reviewStore.getState().clear()} className="ml-auto text-[12px] text-ov-text-2 hover:text-ov-text">
          {t.clear}
        </button>
        <AccentButton onClick={() => void send()}>{t.sendTo(name)}</AccentButton>
      </div>
    </footer>
  );
}
