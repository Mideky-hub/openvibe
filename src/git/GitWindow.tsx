import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { GitBranch, RotateCw, Undo2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useLang, useMessages } from "@/i18n";
import { repoCommit, repoDiscard, repoHistory, repoPush, repoState, type LogEntry, type RepoState } from "@/ipc/repo";
import type { ChangedFile } from "@/ipc/review";
import { cn } from "@/lib/utils";
import { FILE_STATUS } from "@/review/DiffRow";
import { reviewMessages } from "@/review/messages";
import { useReview } from "@/review/reviewStore";
import { AccentButton, IconButton } from "@/shell/buttons";
import { BOTTOM_BAR_HEIGHT, TOP_ROW_HEIGHT } from "@/shell/layout";
import { useProjects } from "@/store/projects";
import { GitDiff, GitMessage } from "./GitDiff";
import { gitWindowStore, useGitWindow } from "./gitWindowStore";
import { gitMessages } from "./messages";

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** The project's changes, commit, history and push, opened from the branch chip (spec fenêtre git). */
export function GitWindow() {
  const path = useGitWindow((s) => s.path);
  const projectPath = useProjects((s) => s.projects.find((p) => p.id === s.activeId)?.path);
  const reviewing = useReview((s) => s.nodeId);

  useEffect(() => {
    if (reviewing || projectPath !== gitWindowStore.getState().path) gitWindowStore.getState().close();
  }, [reviewing, projectPath]);

  return path ? <GitDrawer key={path} path={path} /> : null;
}

function GitDrawer({ path }: { path: string }) {
  const t = useMessages(gitMessages);
  const [tab, setTab] = useState<"changes" | "history">("changes");
  const [repo, setRepo] = useState<RepoState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [failure, setFailure] = useState<string | null>(null);
  const [pushing, setPushing] = useState(false);

  // An older answer arriving late must not overwrite a newer one.
  const reads = useRef(0);
  const read = useCallback(() => {
    const turn = ++reads.current;
    return repoState(path).then(
      (next) => {
        if (turn !== reads.current) return;
        setError(null);
        setRepo(next);
      },
      (failed: unknown) => {
        if (turn === reads.current) setError(errorText(failed));
      },
    );
  }, [path]);

  useEffect(() => {
    void read();
  }, [read]);

  useEffect(() => {
    // An Escape a menu, a dialog or a field already used is theirs, as in the review panel.
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target?.isContentEditable === true;
      if (e.key === "Escape" && !e.defaultPrevented && !typing) gitWindowStore.getState().close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const again = () => {
    setRefresh((n) => n + 1);
    return read();
  };

  const push = async () => {
    const target = repo?.pushTo;
    if (!repo || !target) return;
    setPushing(true);
    setFailure(null);
    try {
      await repoPush(path, repo.branch, target);
      toast(t.push.done(target));
    } catch (failed) {
      setFailure(errorText(failed));
    } finally {
      setPushing(false);
      await again();
    }
  };

  return (
    <aside
      data-git-window
      className="ov-glass-strong absolute right-[72px] z-20 flex w-[min(920px,calc(100vw-180px))] flex-col overflow-hidden rounded-[14px] text-ov-text"
      style={{ top: TOP_ROW_HEIGHT + 14, bottom: BOTTOM_BAR_HEIGHT + 14 }}
    >
      <header className="flex h-10 shrink-0 items-center gap-2 border-b border-ov-line px-3">
        <GitBranch className="size-4 shrink-0 text-ov-accent" />
        <span className="shrink-0 text-[13px] font-semibold">{t.title}</span>
        {repo && (
          <span className="min-w-0 truncate font-mono text-[11px] text-ov-text-2" title={repo.branch}>
            {repo.branch}
          </span>
        )}
        {repo && repo.ahead > 0 && <span className="shrink-0 font-mono text-[11px] text-ov-accent">{t.ahead(repo.ahead)}</span>}
        {repo && repo.behind > 0 && <span className="shrink-0 font-mono text-[11px] text-ov-wait">{t.behind(repo.behind)}</span>}
        <span className="ml-auto flex shrink-0 items-center gap-1">
          {repo && <PushButton repo={repo} pushing={pushing} onPush={() => void push()} />}
          <IconButton label={t.refresh} onClick={() => void again()}>
            <RotateCw />
          </IconButton>
          <IconButton label={t.close} onClick={() => gitWindowStore.getState().close()}>
            <X />
          </IconButton>
        </span>
      </header>
      <div role="tablist" className="flex h-9 shrink-0 items-center gap-1 border-b border-ov-line px-2">
        <Tab active={tab === "changes"} onClick={() => setTab("changes")}>
          {t.tabChanges(repo?.files.length ?? 0)}
        </Tab>
        <Tab active={tab === "history"} onClick={() => setTab("history")}>
          {t.tabHistory}
        </Tab>
      </div>
      {(failure ?? (repo && error)) && (
        <p role="alert" className="shrink-0 whitespace-pre-wrap border-b border-ov-line px-3 py-1.5 text-xs text-ov-danger">
          {failure ?? error}
        </p>
      )}
      {!repo ? (
        <GitMessage>{error ?? t.reading}</GitMessage>
      ) : (
        <>
          {/* Hidden, not unmounted: a look at the history keeps the message being written and the choices. */}
          <div className={tab === "changes" ? "contents" : "hidden"}>
            <ChangesTab path={path} files={repo.files} stamps={repo.stamps} cut={repo.truncated} refresh={refresh} onChanged={() => void again()} onFailure={setFailure} />
          </div>
          {tab === "history" && <HistoryTab path={path} refresh={refresh} />}
        </>
      )}
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
      className={cn("rounded-[6px] px-2.5 py-0.5 text-[12px] text-ov-text-2 hover:text-ov-text", active && "bg-ov-accent-soft text-ov-text")}
    >
      {children}
    </button>
  );
}

/** Greyed, with why, when there is nothing to push or nowhere to (spec fenêtre git §3.5). */
function PushButton({ repo, pushing, onPush }: { repo: RepoState; pushing: boolean; onPush: () => void }) {
  const t = useMessages(gitMessages).push;
  const target = repo.pushTo;
  const ready = target !== null && (repo.ahead > 0 || repo.upstream === null);
  const label = !target ? t.label : repo.ahead > 0 ? t.count(repo.ahead, target) : repo.upstream === null ? t.to(target) : t.label;
  const why = repo.noPush ? t[repo.noPush] : ready ? undefined : t.upToDate;
  return (
    <AccentButton disabled={!ready || pushing} title={why} onClick={onPush} className="h-7 max-w-[260px] truncate px-2.5 text-xs">
      {pushing ? t.pushing : label}
    </AccentButton>
  );
}

function ChangesTab(props: {
  path: string;
  files: ChangedFile[];
  stamps: Record<string, string>;
  cut: boolean;
  refresh: number;
  onChanged: () => void;
  onFailure: (failure: string | null) => void;
}) {
  const { path, files, stamps, cut, refresh, onChanged, onFailure } = props;
  const t = useMessages(gitMessages).changes;
  const words = useMessages(reviewMessages);
  // What is left out, not what is in: a new file arrives checked (spec fenêtre git §3.1).
  const [left, setLeft] = useState<ReadonlySet<string>>(new Set());
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [committing, setCommitting] = useState(false);
  const [asking, setAsking] = useState<ChangedFile | null>(null);
  const all = useRef<HTMLInputElement>(null);

  const chosen = files.filter((file) => !left.has(file.path));
  const selected = files.find((file) => file.path === selectedPath) ?? files[0] ?? null;

  useEffect(() => {
    if (all.current) all.current.indeterminate = chosen.length > 0 && chosen.length < files.length;
  }, [chosen.length, files.length]);

  // A file gone from the list takes its question with it, or the dialog would come back with the file.
  useEffect(() => {
    setAsking((current) => (current && files.some((file) => file.path === current.path) ? current : null));
  }, [files]);

  const toggle = (file: ChangedFile) =>
    setLeft((current) => {
      const next = new Set(current);
      if (!next.delete(file.path)) next.add(file.path);
      return next;
    });

  const commit = async () => {
    setCommitting(true);
    onFailure(null);
    try {
      const hash = await repoCommit(path, chosen, message.trim());
      toast(t.committed(hash));
      setMessage("");
      onChanged();
    } catch (failed) {
      onFailure(errorText(failed));
    } finally {
      setCommitting(false);
    }
  };

  // The only way to `repoDiscard`: the dialog's button (spec fenêtre git §2.1).
  const discard = async (file: ChangedFile) => {
    setAsking(null);
    onFailure(null);
    await repoDiscard(path, file, stamps[file.path] ?? "").catch((failed: unknown) => onFailure(errorText(failed)));
    onChanged();
  };

  if (files.length === 0) return <GitMessage>{t.clean}</GitMessage>;
  return (
    <div className="flex min-h-0 flex-1">
      <div className="flex w-[320px] shrink-0 flex-col border-r border-ov-line">
        <label className="flex shrink-0 items-center gap-2 border-b border-ov-line px-3 py-1 text-[12px] text-ov-text-2">
          <input
            ref={all}
            type="checkbox"
            aria-label={t.includeAll}
            checked={chosen.length === files.length}
            onChange={() => setLeft(chosen.length === 0 ? new Set() : new Set(files.map((file) => file.path)))}
            className="accent-[var(--ov-accent)]"
          />
          {t.includeAll}
        </label>
        <ul className="min-h-0 flex-1 overflow-y-auto py-1">
          {cut && <li className="px-3 py-1 text-[11px] text-ov-text-3">{words.listCut(files.length)}</li>}
          {files.map((file) => {
            const status = FILE_STATUS[file.status];
            return (
              <li
                key={file.path}
                data-git-file={file.path}
                className={cn("group flex items-center gap-2 px-3 text-[12px] text-ov-text-2 hover:bg-ov-hover", selected?.path === file.path && "bg-ov-hover text-ov-text")}
              >
                <input
                  type="checkbox"
                  aria-label={t.include(file.path)}
                  checked={!left.has(file.path)}
                  onChange={() => toggle(file)}
                  className="shrink-0 accent-[var(--ov-accent)]"
                />
                <button
                  type="button"
                  title={`${file.oldPath ? `${file.oldPath} → ` : ""}${file.path} · ${words.status[file.status]}`}
                  onClick={() => setSelectedPath(file.path)}
                  className="flex min-w-0 flex-1 items-center gap-2 py-1 text-left"
                >
                  <span className="w-3 shrink-0 font-mono text-[11px] font-semibold" style={{ color: status.color }}>
                    {status.letter}
                  </span>
                  <span className="min-w-0 flex-1 truncate" style={{ direction: "rtl", textAlign: "left" }}>
                    {file.path}
                  </span>
                  {file.added === null ? (
                    <span className="shrink-0 text-[11px] text-ov-text-3" title={words.binaryOrBig}>
                      —
                    </span>
                  ) : (
                    <span className="shrink-0 font-mono text-[11px]">
                      <span style={{ color: "var(--ov-ok)" }}>+{file.added}</span> <span style={{ color: "var(--ov-danger)" }}>−{file.removed}</span>
                    </span>
                  )}
                </button>
                <IconButton label={t.discard(file.path)} onClick={() => setAsking(file)}>
                  <Undo2 />
                </IconButton>
              </li>
            );
          })}
        </ul>
        <div className="grid shrink-0 gap-2 border-t border-ov-line p-2">
          <textarea
            aria-label={t.messageLabel}
            placeholder={t.messagePlaceholder}
            value={message}
            rows={3}
            onChange={(e) => setMessage(e.target.value)}
            className="resize-none rounded-[6px] bg-ov-field px-2 py-1.5 text-[12px] text-ov-text outline-none placeholder:text-ov-text-3"
          />
          <AccentButton disabled={committing || chosen.length === 0 || !message.trim()} onClick={() => void commit()} className="justify-center text-xs">
            {committing ? t.committing : t.commit(chosen.length)}
          </AccentButton>
        </div>
      </div>
      {selected && <GitDiff key={selected.path} path={path} file={selected} refresh={refresh} />}
      <DiscardDialog file={asking} onCancel={() => setAsking(null)} onConfirm={(file) => void discard(file)} />
    </div>
  );
}

function DiscardDialog({ file, onCancel, onConfirm }: { file: ChangedFile | null; onCancel: () => void; onConfirm: (file: ChangedFile) => void }) {
  const t = useMessages(gitMessages).discard;
  const description = !file ? "" : file.status === "untracked" ? t.deleted(file.path) : file.status === "added" ? t.added(file.path) : t.changed(file.path);
  return (
    <Dialog open={file !== null} onOpenChange={(open) => !open && onCancel()}>
      <DialogContent showCloseButton={false} className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{t.title}</DialogTitle>
          <DialogDescription className="break-words">{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={onCancel}>
            {t.cancel}
          </Button>
          <Button className="bg-ov-danger text-white hover:bg-ov-danger/90" onClick={() => file && onConfirm(file)}>
            {t.confirm}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function HistoryTab({ path, refresh }: { path: string; refresh: number }) {
  const t = useMessages(gitMessages);
  const lang = useLang();
  const [log, setLog] = useState<LogEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    repoHistory(path).then(
      (entries) => alive && setLog(entries),
      (failed: unknown) => alive && setError(errorText(failed)),
    );
    return () => {
      alive = false;
    };
  }, [path, refresh]);

  if (error) return <GitMessage>{error}</GitMessage>;
  if (!log) return <GitMessage>{t.reading}</GitMessage>;
  if (log.length === 0) return <GitMessage>{t.history.empty}</GitMessage>;
  const locale = lang === "fr" ? "fr-FR" : "en-GB";
  return (
    <ul className="min-h-0 flex-1 overflow-y-auto py-1">
      {log.map((entry) => (
        <li key={entry.hash} data-git-commit={entry.hash} className="flex items-center gap-3 px-3 py-1 text-[12px] hover:bg-ov-hover">
          <span title={entry.hash} className="shrink-0 font-mono text-[11px] text-ov-accent">
            {entry.shortHash}
          </span>
          <span title={entry.subject} className="min-w-0 flex-1 truncate text-ov-text">
            {entry.subject}
          </span>
          <span className="max-w-[160px] shrink-0 truncate text-ov-text-2">{entry.author}</span>
          <span className="shrink-0 font-mono text-[11px] text-ov-text-3">
            {new Date(entry.date * 1000).toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" })}
          </span>
        </li>
      ))}
    </ul>
  );
}
