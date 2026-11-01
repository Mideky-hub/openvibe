import { CaptureUpdateAction } from "@excalidraw/excalidraw";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import { canvasStore } from "@/canvas/canvasStore";
import { cachedElements, editStoredScene } from "@/canvas/sceneCache";
import { workspacesStore } from "@/store/workspaces";

/** A workspace's scene, on screen or stored: a mission must not depend on which (spec mission de nuit §6.1). */
export interface SceneAccess {
  /** On screen: the view can move, and a terminal starts when shown. */
  shown: boolean;
  /** Deleted elements included. */
  elements: () => readonly ExcalidrawElement[];
  write: (elements: readonly ExcalidrawElement[]) => void;
}

/** Null when the workspace's scene was never read. */
export function sceneAccess(workspaceId: string): SceneAccess | null {
  const { api } = canvasStore.getState();
  if (api && workspaceId === workspacesStore.getState().activeId) {
    return {
      shown: true,
      elements: () => api.getSceneElementsIncludingDeleted(),
      write: (elements) => api.updateScene({ elements, captureUpdate: CaptureUpdateAction.IMMEDIATELY }),
    };
  }
  if (!cachedElements(workspaceId)) return null;
  return {
    shown: false,
    elements: () => cachedElements(workspaceId) ?? [],
    write: (elements) => editStoredScene(workspaceId, elements),
  };
}
