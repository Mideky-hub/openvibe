import { CaptureUpdateAction } from "@excalidraw/excalidraw";
import { canvasStore } from "@/canvas/canvasStore";
import { createNodeElement } from "@/canvas/nodeElement";
import { nodesStore } from "@/store/nodes";
import { workspacesStore } from "@/store/workspaces";

/** Puts a file node at the center of the view, for a path relative to the project (issue #49). */
export function insertFileNode(path: string): void {
  const api = canvasStore.getState().api;
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
