import { CaptureUpdateAction, newElementWith } from "@excalidraw/excalidraw";
import { canvasStore } from "@/canvas/canvasStore";
import { isNoteName } from "./names";

/** The note names a group carries, in `customData.openvibe.notes` of its frame (spec notes §3). */
export function groupNotesOf(groupId: string): string[] {
  const frame = canvasStore.getState().api?.getSceneElementsIncludingDeleted().find((element) => element.id === groupId);
  const notes = (frame?.customData?.openvibe as { notes?: unknown } | undefined)?.notes;
  return Array.isArray(notes) ? notes.filter((name): name is string => typeof name === "string" && isNoteName(name)) : [];
}

/** In the scene like the group's name: undone, cloned and exported with it. */
export function setGroupNotes(groupId: string, notes: readonly string[]) {
  const api = canvasStore.getState().api;
  if (!api) return;
  api.updateScene({
    elements: api.getSceneElementsIncludingDeleted().map((element) =>
      element.id === groupId
        ? newElementWith(element, { customData: { ...element.customData, openvibe: { ...(element.customData?.openvibe as object | undefined), notes: [...notes] } } })
        : element,
    ),
    captureUpdate: CaptureUpdateAction.IMMEDIATELY,
  });
}
