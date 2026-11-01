import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type { BinaryFileData, BinaryFiles, ExcalidrawInitialDataState } from "@excalidraw/excalidraw/types";
import { loadWorkspace, saveScene } from "@/ipc/db";
import { nodesStore } from "@/store/nodes";
import { liveNodeIds, type SavedAppState } from "./sceneSync";

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

/** The scene of a workspace as last known, deleted elements included; undefined if never read. */
export function cachedElements(workspaceId: string): readonly ExcalidrawElement[] | undefined {
  return cache.get(workspaceId)?.initialData.elements ?? undefined;
}

/**
 * Replaces the scene of a workspace that is not on screen, kept and saved as
 * the canvas would: the save purges the rows of nodes it does not list, so it
 * lists them all (spec mission de nuit §6.1).
 */
export function editStoredScene(workspaceId: string, elements: readonly ExcalidrawElement[]) {
  const scene = cache.get(workspaceId);
  if (!scene) return;
  cache.set(workspaceId, { ...scene, initialData: { ...scene.initialData, elements } });
  const live = elements.filter((e) => !e.isDeleted);
  // A node's row comes before its element: one on its way is not to purge.
  const closed = new Set(elements.filter((e) => e.isDeleted).map((e) => e.id));
  const onTheirWay = Object.entries(nodesStore.getState().nodes).flatMap(([id, node]) => (node.workspaceId === workspaceId && !closed.has(id) ? [id] : []));
  const nodeIds = [...new Set([...liveNodeIds(elements), ...onTheirWay])];
  void saveScene(workspaceId, JSON.stringify(live), JSON.stringify(scene.initialData.appState ?? {}), nodeIds).catch((error: unknown) =>
    console.warn("stored scene not saved", error),
  );
}

export function forgetScene(workspaceId: string) {
  cache.delete(workspaceId);
}
