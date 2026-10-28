import { projectsStore } from "@/store/projects";
import { openFile, openStudio, studioStore } from "./studioStore";

// Stub: the Code workspace's own navigation replaces it at the merge.

const activeProjectPath = () => {
  const { projects, activeId } = projectsStore.getState();
  return projects.find((p) => p.id === activeId)?.path ?? null;
};

/** Shows the Code Studio of the project on screen. */
export async function openCodeWorkspace(): Promise<void> {
  const project = activeProjectPath();
  if (project) openStudio(project);
}

/** Opens the file in the Code Studio, its cursor at `line` when one is given. */
export async function openInCodeStudio(path: string, line?: number): Promise<void> {
  await openCodeWorkspace();
  await openFile(path);
  if (line !== undefined) studioStore.setState({ pendingLine: { path, line } });
}
