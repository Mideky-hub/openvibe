import { projectsStore } from "@/store/projects";
import { workspacesStore } from "@/store/workspaces";
import { openFile, openStudio, studioStore } from "./studioStore";

const activeProjectPath = () => {
  const { projects, activeId } = projectsStore.getState();
  return projects.find((p) => p.id === activeId)?.path ?? null;
};

/** Shows the active project's code workspace, creating its tab the first time. */
export async function openCodeWorkspace(): Promise<void> {
  const project = activeProjectPath();
  if (!project) return;
  if (!(await workspacesStore.getState().openCode())) return;
  // Before the workspace is on screen, so that a file can open at once.
  openStudio(project);
}

/** Opens `path` (relative to the project) in the code workspace; `line` (and `column`) wait for the editor. */
export async function openInCodeStudio(path: string, line?: number, column?: number): Promise<void> {
  await openCodeWorkspace();
  if (!studioStore.getState().project) return;
  const opened = openFile(path);
  if (line !== undefined) studioStore.setState({ pendingLine: { path, line, ...(column !== undefined ? { column } : {}) } });
  await opened;
}
