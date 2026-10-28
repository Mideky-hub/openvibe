import { CaptureUpdateAction } from "@excalidraw/excalidraw";
import { toast } from "sonner";
import { canvasStore } from "@/canvas/canvasStore";
import { createNodeElement } from "@/canvas/nodeElement";
import { viewportCenter } from "@/fleet/placement";
import type { Point } from "@/fleet/terminals";
import { messages } from "@/i18n";
import { nodesStore } from "@/store/nodes";
import { workspacesStore } from "@/store/workspaces";
import { emptyBoard } from "./board";
import { kanbanMessages } from "./messages";

/** A new Kanban board at `center`, saved before it appears, in one undo step. */
export async function addKanban(workspaceId: string, center: Point) {
  const api = canvasStore.getState().api;
  if (!api) return;
  const element = createNodeElement("kanban", center);
  const payload = emptyBoard(messages(kanbanMessages).defaultColumns);
  await nodesStore.getState().create(element.id, { workspaceId, kind: "kanban", payload });
  api.updateScene({
    elements: [...api.getSceneElementsIncludingDeleted(), element],
    captureUpdate: CaptureUpdateAction.IMMEDIATELY,
  });
}

/** « Kanban »: at `at`, else at the center of the view. */
export function placeKanban(at?: Point) {
  const workspaceId = workspacesStore.getState().activeId;
  if (!workspaceId) return;
  void addKanban(workspaceId, at ?? viewportCenter(canvasStore.getState().view)).catch((error: unknown) =>
    toast.error(messages(kanbanMessages).placeFailed(String(error))),
  );
}
