import { CaptureUpdateAction } from "@excalidraw/excalidraw";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { canvasStore } from "@/canvas/canvasStore";
import { createNodeElement } from "@/canvas/nodeElement";
import { nodesStore } from "@/store/nodes";
import { isCode, workspacesStore } from "@/store/workspaces";

/** The canvas of the active workspace, once its scene is on screen. */
function canvasOnScreen(timeoutMs = 5000): Promise<ExcalidrawImperativeAPI | null> {
  const now = canvasStore.getState().api;
  if (now) return Promise.resolve(now);
  return new Promise((resolve) => {
    const done = (api: ExcalidrawImperativeAPI | null) => {
      unsubscribe();
      clearTimeout(timer);
      resolve(api);
    };
    const unsubscribe = canvasStore.subscribe((s) => s.api && done(s.api));
    const timer = setTimeout(() => done(null), timeoutMs);
  });
}

/**
 * Puts a file node at the center of the view, for a path relative to the
 * project (issue #49). From the code workspace, it goes to the last canvas shown.
 */
export async function insertFileNode(path: string): Promise<void> {
  const workspaces = workspacesStore.getState();
  const active = workspaces.workspaces.find((w) => w.id === workspaces.activeId);
  if (isCode(active)) {
    const target = workspaces.lastCanvasId ?? workspaces.workspaces.find((w) => !isCode(w))?.id;
    if (!target) return;
    workspaces.select(target);
  }
  const api = await canvasOnScreen();
  const workspaceId = workspacesStore.getState().activeId;
  if (!api || !workspaceId) return;
  const { width, height, scrollX, scrollY, zoom } = api.getAppState();
  const center = { x: width / 2 / zoom.value - scrollX, y: height / 2 / zoom.value - scrollY };
  const element = createNodeElement("file", center);
  nodesStore
    .getState()
    .create(element.id, { workspaceId, kind: "file", payload: { path } })
    .then(() => {
      api.updateScene({
        elements: [...api.getSceneElementsIncludingDeleted(), element],
        captureUpdate: CaptureUpdateAction.IMMEDIATELY,
      });
    })
    .catch((error: unknown) => console.warn("file node not inserted", error));
}
