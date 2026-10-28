import { useEffect, useState } from "react";
import { createStore, useStore } from "zustand";
import { studioTree } from "@/ipc/studio";

/** The files of each project, for « Aller à… »: kept between openings, read again at each. */
interface FileIndexState {
  files: Record<string, readonly string[]>;
}

export const fileIndexStore = createStore<FileIndexState>()(() => ({ files: {} }));

/** Reads the project's tree again; the files known so far stay while it is read, and when it fails. */
export async function refreshFileIndex(project: string): Promise<void> {
  try {
    const entries = await studioTree(project);
    const files = entries.filter((e) => e.kind === "file").map((e) => e.path.replaceAll("\\", "/"));
    fileIndexStore.setState((s) => ({ files: { ...s.files, [project]: files } }));
  } catch {
    // The palette lists the nodes anyway.
  }
}

/** The project's files, read again when the component comes (each opening of the palette). */
export function useFileIndex(project: string | null): { files: readonly string[]; loading: boolean } {
  const files = useStore(fileIndexStore, (s) => (project ? s.files[project] : undefined));
  const [loading, setLoading] = useState(project !== null);
  useEffect(() => {
    if (!project) return;
    let alive = true;
    setLoading(true);
    void refreshFileIndex(project).finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [project]);
  return { files: files ?? [], loading: project !== null && loading && !files };
}
