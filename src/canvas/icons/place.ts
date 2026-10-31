import { CaptureUpdateAction, restoreElements } from "@excalidraw/excalidraw";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import { focusCanvas } from "@/radial/bridges";
import { canvasStore } from "../canvasStore";
import { instantiate, type IconItem, type RawElement } from "./library";

/** Puts a copy of the icon at the center of the view, selected, in one undo step (spec maj §4); false without a canvas. */
export function insertIcon(item: IconItem): boolean {
  const api = canvasStore.getState().api;
  if (!api) return false;
  const { width, height, scrollX, scrollY, zoom } = api.getAppState();
  const center = { x: width / 2 / zoom.value - scrollX, y: height / 2 / zoom.value - scrollY };
  const restored = restoreElements(item.elements as unknown as ExcalidrawElement[], null, { refreshDimensions: false, repairBindings: true });
  const fresh = instantiate(restored as unknown as RawElement[], center, () => crypto.randomUUID()) as unknown as ExcalidrawElement[];
  const groups = fresh[0]?.groupIds ?? [];
  const whole = groups.length > 0 ? groups[groups.length - 1] : null;
  api.updateScene({
    elements: [...api.getSceneElementsIncludingDeleted(), ...fresh],
    appState: {
      selectedElementIds: Object.fromEntries(fresh.map((e) => [e.id, true as const])),
      selectedGroupIds: whole ? { [whole]: true } : {},
      // The icon takes the keyboard: no terminal stays active, no group stays open (final review maj §4).
      activeEmbeddable: null,
      editingGroupId: null,
    },
    captureUpdate: CaptureUpdateAction.IMMEDIATELY,
  });
  api.setActiveTool({ type: "selection" });
  focusCanvas();
  return true;
}
