import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { BookOpen, Plus, RotateCw, X } from "lucide-react";
import { useStore } from "zustand";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useTheme } from "@/app/theme";
import { useMessages } from "@/i18n";
import { cn } from "@/lib/utils";
import { AccentButton, IconButton } from "@/shell/buttons";
import { closeWindow } from "@/shell/windowState";
import { CodeEditor, type CodeEditorHandle } from "@/studio/CodeEditor";
import { createFileSession, isDirty } from "@/studio/fileSession";
import { DiskBanner, errorText, FULL_WINDOW, Message } from "@/studio/parts";
import { useFileSessionEffects } from "@/studio/sessionEffects";
import { UnsavedDialog } from "@/studio/UnsavedDialog";
import { notesAll, notesRead, notesVersion, notesWrite, type NoteList } from "./ipc";
import { backlinks, noteNamed } from "./links";
import { notesMessages } from "./messages";
import { isNoteName } from "./names";
import { NoteGraph } from "./NoteGraph";
import { NoteReader } from "./NoteReader";
import { closeNotes } from "./notesStore";
import { searchNotes } from "./search";

type Tab = "edit" | "read" | "graph";

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
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

/** The project's notes (spec notes): one open at a time, under the code studio's guards. */
export default function NotesDialog({ projectId }: { projectId: string }) {
  const t = useMessages(notesMessages);
  const theme = useTheme();
  const session = useMemo(
    () =>
      createFileSession(
        {
          read: (name) => notesRead(projectId, name),
          version: (name) => notesVersion(projectId, name),
          write: (name, text, expected) => notesWrite(projectId, name, text, expected),
        },
        {
          onClose: closeNotes,
          onQuit: () => {
            closeNotes();
            closeWindow();
          },
        },
      ),
    [projectId],
  );
  const state = useStore(session);
  const editor = useRef<CodeEditorHandle>(null);
  const nameField = useRef<HTMLInputElement>(null);
  const [list, setList] = useState<NoteList | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("read");
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState<string | null>(null);
  const [badName, setBadName] = useState(false);

  const refresh = useCallback(async () => {
    setListError(null);
    try {
      const next = await notesAll(projectId);
      setList(next);
      return next;
    } catch (failure) {
      setListError(errorText(failure));
      return null;
    }
  }, [projectId]);

  useEffect(() => {
    void refresh();
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refresh]);

  useFileSessionEffects(session);

  const { file, version, draft, loading, refused, pending, saving, error, disk } = state;
  const dirty = isDirty(state);

  // What the session wrote or reloaded: backlinks and the graph read the list. On `version` alone:
  // a modified note may differ from the disk for long, and the list must not be asked for again meanwhile.
  useEffect(() => {
    if (version && list?.notes.find((note) => note.name === file)?.version !== version) void refresh();
  }, [version]);

  /** The list, the open note as it stands in the editor. */
  const notes = useMemo(() => (list?.notes ?? []).map((note) => (note.name === file ? { ...note, text: draft } : note)), [list, file, draft]);
  const hits = useMemo(() => searchNotes(notes, query), [notes, query]);
  const linking = useMemo(() => (file ? backlinks(notes, file) : []), [notes, file]);

  const open = (name: string) => {
    void state.open(name);
    if (tab === "graph") setTab("read");
  };

  const askName = (name: string) => {
    setCreating(name);
    setBadName(false);
    nameField.current?.focus();
  };

  const create = async () => {
    const name = (creating ?? "").trim();
    if (!isNoteName(name)) return setBadName(true);
    const existing = noteNamed(list?.notes ?? [], name);
    setCreating(null);
    if (existing) return open(existing.name);
    try {
      const outcome = await notesWrite(projectId, name, `# ${name}\n`, null);
      await refresh();
      await state.open(name);
      if (outcome.status === "saved") setTab("edit");
    } catch (failure) {
      setListError(errorText(failure));
    }
  };

  const shown = !file || loading || refused ? null : tab;

  return (
    <Dialog open onOpenChange={(next) => !next && state.requestClose()}>
      <DialogContent
        data-notes
        showCloseButton={false}
        aria-describedby={undefined}
        style={FULL_WINDOW}
        // A click beside the window is not a request to close a work tool.
        onInteractOutside={(event) => event.preventDefault()}
        onEscapeKeyDown={(event) => {
          // Radix takes Échap first and cancels it, so CodeMirror never sees it: its panels are closed from here.
          event.preventDefault();
          if (tab !== "edit" || !editor.current?.escape()) state.requestClose();
        }}
      >
        <header className="flex h-11 shrink-0 items-center gap-2 border-b border-ov-line px-3">
          <BookOpen className="size-4 shrink-0 text-ov-accent" />
          <DialogTitle className="shrink-0" style={{ fontSize: 13, fontWeight: 600 }}>
            {t.title}
          </DialogTitle>
          {file && (
            <span className="min-w-0 truncate font-mono text-[11px] text-ov-text-3" title={file}>
              {file}
            </span>
          )}
          {dirty && <span data-dirty title={t.modified} aria-label={t.modified} className="size-2 shrink-0 rounded-full bg-ov-accent" />}
          <span role="tablist" className="ml-auto flex shrink-0 items-center gap-1">
            <TabButton active={tab === "edit"} onClick={() => setTab("edit")}>
              {t.tabEdit}
            </TabButton>
            <TabButton active={tab === "read"} onClick={() => setTab("read")}>
              {t.tabRead}
            </TabButton>
            <TabButton active={tab === "graph"} onClick={() => setTab("graph")}>
              {t.tabGraph}
            </TabButton>
          </span>
          <span className="flex shrink-0 items-center gap-1">
            <AccentButton disabled={!dirty || saving} onClick={() => void state.save()}>
              {saving ? t.saving : t.save}
            </AccentButton>
            <IconButton label={t.refresh} onClick={() => void refresh()}>
              <RotateCw />
            </IconButton>
            <IconButton label={t.close} onClick={() => state.requestClose()}>
              <X />
            </IconButton>
          </span>
        </header>
        <div className="flex min-h-0 flex-1">
          <div className="flex w-[260px] shrink-0 flex-col border-r border-ov-line">
            <div className="flex shrink-0 items-center gap-1 p-2">
              <input
                aria-label={t.searchLabel}
                placeholder={t.searchPlaceholder(notes.length)}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="h-7 min-w-0 flex-1 rounded-[6px] bg-ov-field px-2 text-[12px] text-ov-text outline-none placeholder:text-ov-text-3"
              />
              <IconButton label={t.newNote} onClick={() => askName("")}>
                <Plus />
              </IconButton>
            </div>
            {creating !== null && (
              <div className="shrink-0 px-2 pb-2">
                <input
                  ref={nameField}
                  autoFocus
                  aria-label={t.nameLabel}
                  aria-invalid={badName}
                  placeholder={t.namePlaceholder}
                  value={creating}
                  onChange={(e) => {
                    setCreating(e.target.value);
                    setBadName(false);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void create();
                  }}
                  className="h-7 w-full rounded-[6px] bg-ov-field px-2 text-[12px] text-ov-text outline-none placeholder:text-ov-text-3"
                />
                {badName && <p className="pt-1 text-[11px] text-ov-danger">{t.badName}</p>}
              </div>
            )}
            <div className="min-h-0 flex-1 overflow-y-auto pb-1">
              {listError ? (
                <p className="px-3 py-2 text-xs text-ov-danger">{listError}</p>
              ) : !list ? (
                <p className="px-3 py-2 text-xs text-ov-text-2">{t.reading}</p>
              ) : list.notes.length === 0 ? (
                <p className="px-3 py-2 text-xs text-ov-text-2">{t.empty}</p>
              ) : hits.length === 0 ? (
                <p className="px-3 py-2 text-xs text-ov-text-2">{t.noResult}</p>
              ) : (
                hits.map((hit) => (
                  <button
                    key={hit.name}
                    type="button"
                    data-note={hit.name}
                    title={hit.name}
                    aria-current={hit.name === file}
                    onClick={() => open(hit.name)}
                    className={cn("block w-full px-3 py-1 text-left hover:bg-ov-hover", hit.name === file && "bg-ov-accent-soft hover:bg-ov-accent-soft")}
                  >
                    <span className="block truncate text-[12.5px] text-ov-text">{hit.name}</span>
                    {hit.excerpt && <span className="block truncate text-[11px] text-ov-text-3">{hit.excerpt}</span>}
                  </button>
                ))
              )}
            </div>
            {list !== null && list.skipped > 0 && <p className="shrink-0 border-t border-ov-line px-3 py-1.5 text-[11px] text-ov-text-3">{t.skipped(list.skipped)}</p>}
          </div>
          <div className="flex min-w-0 flex-1 flex-col">
            {disk && <DiskBanner session={session} disk={disk} />}
            {error && (
              <p role="status" className="shrink-0 border-b border-ov-line px-3 py-1.5 text-[12px] text-ov-danger">
                {error}
              </p>
            )}
            {tab === "graph" ? (
              <NoteGraph notes={notes} current={file} onOpen={open} />
            ) : !file ? (
              <Message>{t.pickNote}</Message>
            ) : loading ? (
              <Message>{t.readingNote}</Message>
            ) : refused ? (
              <Message>{refused}</Message>
            ) : tab === "read" ? (
              <NoteReader text={draft} notes={notes} onOpen={open} onCreate={askName} />
            ) : null}
            {/* Always there once a note is open: the views come and go, the undo history stays. */}
            {file && !loading && !refused && (
              <div className={cn("min-h-0 flex-1 flex-col", shown === "edit" ? "flex" : "hidden")}>
                <CodeEditor ref={editor} path={`${file}.md`} text={draft} revision={state.revision} theme={theme} onChange={state.edit} onSave={() => void state.save()} />
              </div>
            )}
            {file && !loading && !refused && tab !== "graph" && (
              <section data-backlinks aria-label={t.backlinks} className="max-h-[30%] shrink-0 overflow-y-auto border-t border-ov-line px-3 py-2">
                <h3 className="pb-1 text-[11px] font-semibold text-ov-text-2">{t.backlinks}</h3>
                {linking.length === 0 ? (
                  <p className="text-[11.5px] text-ov-text-3">{t.noBacklinks}</p>
                ) : (
                  <ul className="flex flex-wrap gap-x-3 gap-y-0.5">
                    {linking.map((note) => (
                      <li key={note.name}>
                        <button type="button" onClick={() => open(note.name)} className="text-[12px] text-ov-accent underline underline-offset-2">
                          {note.name}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            )}
          </div>
        </div>
        <UnsavedDialog file={pending ? file : null} saving={saving} onAnswer={(answer) => void state.resolve(answer)} />
      </DialogContent>
    </Dialog>
  );
}
