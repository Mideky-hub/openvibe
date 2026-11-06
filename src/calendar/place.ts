import { CaptureUpdateAction } from "@excalidraw/excalidraw";
import { toast } from "sonner";
import { canvasStore } from "@/canvas/canvasStore";
import { createNodeElement } from "@/canvas/nodeElement";
import { viewportCenter } from "@/fleet/placement";
import type { Point } from "@/fleet/terminals";
import { messages } from "@/i18n";
import { nodesStore } from "@/store/nodes";
import { workspacesStore } from "@/store/workspaces";
import { calendarMessages } from "./messages";

/** A new, empty calendar at `center`, saved before it appears, in one undo step. */
export async function addCalendar(workspaceId: string, center: Point) {
  const api = canvasStore.getState().api;
  if (!api) return;
  const element = createNodeElement("calendar", center);
  await nodesStore.getState().create(element.id, { workspaceId, kind: "calendar", payload: { events: [] } });
  api.updateScene({
    elements: [...api.getSceneElementsIncludingDeleted(), element],
    captureUpdate: CaptureUpdateAction.IMMEDIATELY,
  });
}

/** « Calendrier »: at `at`, else at the center of the view. */
export function placeCalendar(at?: Point) {
  const workspaceId = workspacesStore.getState().activeId;
  if (!workspaceId) return;
  void addCalendar(workspaceId, at ?? viewportCenter(canvasStore.getState().view)).catch((error: unknown) =>
    toast.error(messages(calendarMessages).placeFailed(String(error))),
  );
}
