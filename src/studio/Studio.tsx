import { lazy, Suspense } from "react";
import { useProjects } from "@/store/projects";
import { useStudioOpen } from "./studioStore";

// CodeMirror and its languages load with the first opening, not with the application.
const StudioDialog = lazy(() => import("./StudioDialog"));

export function Studio() {
  const open = useStudioOpen();
  const projectId = useProjects((s) => s.activeId);
  if (!open || !projectId) return null;
  return (
    <Suspense fallback={null}>
      <StudioDialog key={projectId} projectId={projectId} />
    </Suspense>
  );
}
