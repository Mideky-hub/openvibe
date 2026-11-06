import { focusTerminal } from "@/nodes/terminal/registry";
import { arrive } from "./arrive";
import { ZONE_OFFSETS } from "./canvasFocus";
import { canvasStore, fullSizeView } from "./canvasStore";

/** The fleet panel's click: the view centered on the terminal at 100 %, the element activated (its header menu answers at once), and the keyboard to it (spec habillage §5.5). */
export function focusNode(nodeId: string) {
  const api = canvasStore.getState().api;
  const element = api?.getSceneElements().find((e) => e.id === nodeId);
  if (!api || !element) return;
  // Its group is folded: arriving unfolds it, then centers and activates (spec replier un groupe §2).
  if (canvasStore.getState().frames.some((f) => f.group?.folded && f.memberIds.includes(nodeId))) {
    arrive(nodeId);
    return;
  }
  api.updateScene({ appState: { ...fullSizeView(element, api.getAppState()), activeEmbeddable: { element, state: "active" } } });
  focusTerminal(nodeId);
}

/** « Cadrer l'équipe » of the mission map: these nodes fitted, at 100 % at most (#63). False when none is on the canvas. */
export function frameNodes(nodeIds: readonly string[]): boolean {
  const api = canvasStore.getState().api;
  const elements = api?.getSceneElements().filter((e) => nodeIds.includes(e.id)) ?? [];
  if (!api || elements.length === 0) return false;
  api.scrollToContent(elements, { fitToViewport: true, viewportZoomFactor: 0.9, animate: true, maxZoom: 1, canvasOffsets: ZONE_OFFSETS });
  return true;
}
