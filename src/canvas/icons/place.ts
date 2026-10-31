import { CaptureUpdateAction, restoreElements } from "@excalidraw/excalidraw";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import { focusCanvas } from "@/radial/bridges";
import { canvasStore } from "../canvasStore";
import { groupAt } from "../groups";
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
  // On a group of agents the icon joins its frame, as Excalidraw would add it (a frame sits above its children).
  const target = groupAt(canvasStore.getState().frames, center);
  const scene = api.getSceneElementsIncludingDeleted();
  const frameAt = target ? scene.findIndex((e) => e.id === target.id) : -1;
  const placed = frameAt === -1 ? fresh : fresh.map((e) => ({ ...e, frameId: target!.id }) as ExcalidrawElement);
  api.updateScene({
    elements: frameAt === -1 ? [...scene, ...placed] : [...scene.slice(0, frameAt), ...placed, ...scene.slice(frameAt)],
    appState: {
      selectedElementIds: Object.fromEntries(placed.map((e) => [e.id, true as const])),
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
