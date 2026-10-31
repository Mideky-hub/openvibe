import { lazy, Suspense } from "react";
import { useProjects } from "@/store/projects";
import { GroupNotesDialog } from "./GroupNotesDialog";
import { useNotesUi } from "./notesStore";

// CodeMirror loads with the first opening, not with the application.
const NotesDialog = lazy(() => import("./NotesDialog"));

export function Notes() {
  const open = useNotesUi((s) => s.open);
  const projectId = useProjects((s) => s.activeId);
  return (
    <>
      {open && projectId && (
        <Suspense fallback={null}>
          <NotesDialog key={projectId} projectId={projectId} />
        </Suspense>
      )}
      <GroupNotesDialog />
    </>
  );
}
