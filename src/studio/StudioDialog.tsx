import { useEffect, useMemo, useRef, useState, type ComponentProps, type ReactNode } from "react";
import { CodeXml, RotateCw, X } from "lucide-react";
import { useStore } from "zustand";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useMessages } from "@/i18n";
import { AccentButton, IconButton } from "@/shell/buttons";
import { closeWindow } from "@/shell/windowState";
import { CodeEditor, type CodeEditorHandle } from "./CodeEditor";
import { createFileSession, isDirty, type FileSession, type SessionState } from "./fileSession";
import { studioFiles, studioRead, studioVersion, studioWrite } from "./ipc";
import { studioMessages } from "./messages";
import { closeStudio, guardQuit } from "./studioStore";
import { StudioTree } from "./StudioTree";
import { UnsavedDialog } from "./UnsavedDialog";

/** Agents write by every means there is: the disk is compared this often (spec studio code §3). */
const POLL_MS = 2000;

/** The dialog's own classes center a small box; the studio fills the window, 16 px from its edges. */
const FULL_WINDOW: ComponentProps<typeof DialogContent>["style"] = {
  display: "flex",
  flexDirection: "column",
  gap: 0,
  padding: 0,
  top: 16,
  left: 16,
  right: 16,
  bottom: 16,
  width: "auto",
  maxWidth: "none",
  translate: "none",
  overflow: "hidden",
};

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));

function Message({ children }: { children: ReactNode }) {
  return <p className="grid flex-1 place-items-center p-6 text-center text-xs text-ov-text-2">{children}</p>;
}

/** The disk no longer holds what the buffer knows: only the user decides (spec studio code §3). */
function DiskBanner({ session, disk }: { session: FileSession; disk: NonNullable<SessionState["disk"]> }) {
  const t = useMessages(studioMessages);
  const { reload, overwrite, dropFile } = session.getState();
  const gone = disk.version === null;
  const action = "shrink-0 rounded-[6px] px-2 py-0.5 text-[12px] font-medium text-ov-text hover:bg-ov-hover";
  return (
    <div
      role="alert"
      className="flex shrink-0 items-center gap-2 border-b border-ov-line px-3 py-1.5 text-[12px] text-ov-text"
      style={{ backgroundColor: "color-mix(in srgb, var(--ov-wait) 16%, transparent)" }}
    >
      <span className="min-w-0 flex-1">{gone ? t.deletedOnDisk : t.changedOnDisk}</span>
      {gone ? (
        <>
          <button type="button" className={action} onClick={dropFile}>
            {t.drop}
          </button>
          <button type="button" className={action} onClick={() => void overwrite()}>
            {t.recreate}
          </button>
        </>
      ) : (
        <>
          <button type="button" className={action} onClick={() => void reload()}>
            {t.reload}
          </button>
          <button type="button" className={action} onClick={() => void overwrite()}>
            {t.overwrite}
          </button>
        </>
      )}
    </div>
  );
}

/** The code studio (spec studio code): the project's files, one at a time, edited by hand. */
export default function StudioDialog({ projectId }: { projectId: string }) {
  const t = useMessages(studioMessages);
  const session = useMemo(
    () =>
      createFileSession(
        {
          read: (file) => studioRead(projectId, file),
          version: (file) => studioVersion(projectId, file),
          write: (file, text, expected) => studioWrite(projectId, file, text, expected),
        },
        {
          onClose: closeStudio,
          onQuit: () => {
            closeStudio();
            closeWindow();
          },
        },
      ),
    [projectId],
  );
  const state = useStore(session);
  const editor = useRef<CodeEditorHandle>(null);
  const [files, setFiles] = useState<string[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    let alive = true;
    setListError(null);
    studioFiles(projectId).then(
      (list) => alive && setFiles(list),
      (failure: unknown) => alive && setListError(errorText(failure)),
    );
    return () => {
      alive = false;
    };
  }, [projectId, refresh]);

  useEffect(() => {
    const poll = () => void session.getState().poll();
    const timer = setInterval(poll, POLL_MS);
    window.addEventListener("focus", poll);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", poll);
    };
  }, [session]);

  useEffect(() => guardQuit(() => session.getState().holdQuit()), [session]);

  useEffect(() => {
    // In the capture phase, wherever the keyboard is (the tree, the search panel): else WebView2 offers to save the page.
    const onKey = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey || event.key.toLowerCase() !== "s") return;
      event.preventDefault();
      event.stopPropagation();
      void session.getState().save();
    };
    window.addEventListener("keydown", onKey, { capture: true });
    return () => window.removeEventListener("keydown", onKey, { capture: true });
  }, [session]);

  const dirty = isDirty(state);
  const { file, loading, refused, pending, saving, error, disk } = state;
  return (
    <Dialog open onOpenChange={(open) => !open && state.requestClose()}>
      <DialogContent
        data-studio
        showCloseButton={false}
        aria-describedby={undefined}
        style={FULL_WINDOW}
        // A click beside the window is not a request to close a work tool.
        onInteractOutside={(event) => event.preventDefault()}
        onEscapeKeyDown={(event) => {
          // Radix takes Échap first and cancels it, so CodeMirror never sees it: its panels are closed from here.
          event.preventDefault();
          if (!editor.current?.escape()) state.requestClose();
        }}
      >
        <header className="flex h-11 shrink-0 items-center gap-2 border-b border-ov-line px-3">
          <CodeXml className="size-4 shrink-0 text-ov-accent" />
          <DialogTitle className="shrink-0" style={{ fontSize: 13, fontWeight: 600 }}>
            {t.title}
          </DialogTitle>
          {file && (
            <span className="min-w-0 truncate font-mono text-[11px] text-ov-text-3" title={file}>
              {file}
            </span>
          )}
          {dirty && <span data-dirty title={t.modified} aria-label={t.modified} className="size-2 shrink-0 rounded-full bg-ov-accent" />}
          <span className="ml-auto flex shrink-0 items-center gap-1">
            <AccentButton disabled={!dirty || saving} onClick={() => void state.save()}>
              {saving ? t.saving : t.save}
            </AccentButton>
            <IconButton label={t.refresh} onClick={() => setRefresh((n) => n + 1)}>
              <RotateCw />
            </IconButton>
            <IconButton label={t.close} onClick={() => state.requestClose()}>
              <X />
            </IconButton>
          </span>
        </header>
        <div className="flex min-h-0 flex-1">
          {files && files.length > 0 ? (
            <StudioTree files={files} selected={file} onOpen={(next) => void state.open(next)} />
          ) : (
            <div className="flex w-[260px] shrink-0 border-r border-ov-line">
              <Message>{listError ?? (files ? t.noFiles : t.readingFiles)}</Message>
            </div>
          )}
          <div className="flex min-w-0 flex-1 flex-col">
            {disk && <DiskBanner session={session} disk={disk} />}
            {error && (
              <p role="status" className="shrink-0 border-b border-ov-line px-3 py-1.5 text-[12px] text-ov-danger">
                {t.failed(error)}
              </p>
            )}
            {!file ? (
              <Message>{t.pickFile}</Message>
            ) : loading ? (
              <Message>{t.readingFile}</Message>
            ) : refused ? (
              <Message>{refused}</Message>
            ) : (
              <CodeEditor ref={editor} path={file} text={state.draft} revision={state.revision} onChange={state.edit} />
            )}
          </div>
        </div>
        <UnsavedDialog file={pending ? file : null} saving={saving} onAnswer={(answer) => void state.resolve(answer)} />
      </DialogContent>
    </Dialog>
  );
}
