import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type { BinaryFileData, BinaryFiles, ExcalidrawInitialDataState } from "@excalidraw/excalidraw/types";
import { loadWorkspace } from "@/ipc/db";
import { nodesStore } from "@/store/nodes";
import type { SavedAppState } from "./sceneSync";

export interface LoadedScene {
  initialData: ExcalidrawInitialDataState;
  savedFileIds: string[];
}

// Scenes are read from SQLite once per session, then kept current here so that
// switching back to a workspace never waits on (or races with) a pending save.
const cache = new Map<string, LoadedScene>();
// A read in progress is shared: the canvas and the palette ask for the same scene at once.
const reading = new Map<string, Promise<LoadedScene>>();

export function loadScene(workspaceId: string): Promise<LoadedScene> {
  const cached = cache.get(workspaceId);
  if (cached) return Promise.resolve(cached);
  const pending = reading.get(workspaceId);
  if (pending) return pending;
  const read = readScene(workspaceId).finally(() => reading.delete(workspaceId));
  reading.set(workspaceId, read);
  return read;
}

async function readScene(workspaceId: string): Promise<LoadedScene> {
  const data = await loadWorkspace(workspaceId);
  nodesStore.getState().hydrate(workspaceId, data.nodes);
  const files: BinaryFiles = Object.fromEntries(
    data.files.map((f) => [
      f.id,
      { id: f.id, mimeType: f.mimeType, dataURL: f.dataUrl, created: f.created } as unknown as BinaryFileData,
    ]),
  );
  const scene: LoadedScene = {
    initialData: {
      elements: data.elementsJson ? (JSON.parse(data.elementsJson) as ExcalidrawElement[]) : [],
      appState: data.appStateJson ? (JSON.parse(data.appStateJson) as SavedAppState) : {},
      files,
    },
    savedFileIds: data.files.map((f) => f.id),
  };
  // A scene remembered (or forgotten) while the read ran is newer than this read.
  const current = cache.get(workspaceId);
  if (current) return current;
  cache.set(workspaceId, scene);
  return scene;
}

/** Keeps the cached copy current with what is on screen. */
export function rememberScene(
  workspaceId: string,
  elements: readonly ExcalidrawElement[],
  appState: SavedAppState,
  files: BinaryFiles,
  savedFileIds: string[],
) {
  cache.set(workspaceId, { initialData: { elements, appState, files }, savedFileIds });
}

export function forgetScene(workspaceId: string) {
  cache.delete(workspaceId);
}
