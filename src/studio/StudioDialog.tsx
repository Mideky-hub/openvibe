import { useEffect, useMemo, useRef, useState } from "react";
import { CodeXml, RotateCw, X } from "lucide-react";
import { useStore } from "zustand";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useMessages } from "@/i18n";
import { AccentButton, IconButton } from "@/shell/buttons";
import { closeWindow } from "@/shell/windowState";
import { CodeEditor, type CodeEditorHandle } from "./CodeEditor";
import { createFileSession, isDirty } from "./fileSession";
import { studioFiles, studioRead, studioVersion, studioWrite } from "./ipc";
import { studioMessages } from "./messages";
import { DiskBanner, errorText, FULL_WINDOW, Message } from "./parts";
import { useFileSessionEffects } from "./sessionEffects";
import { closeStudio } from "./studioStore";
import { StudioTree } from "./StudioTree";
import { UnsavedDialog } from "./UnsavedDialog";

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

  useFileSessionEffects(session);

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
