import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import { BOTTOM_BAR_HEIGHT, TOP_ROW_HEIGHT } from "@/shell/layout";
import { uiStore } from "@/store/ui";
import { canvasStore } from "./canvasStore";
import { groupInfoOf } from "./groups";
import { nodeKindOf } from "./nodeElement";

/** The glass bars cover the canvas edges: views fit the zone utile, not the whole window (plan E1). */
export const ZONE_OFFSETS = { top: TOP_ROW_HEIGHT, bottom: BOTTOM_BAR_HEIGHT };

/** A group's name sits on its frame, above it: room for the label under the tabs. */
const LABEL_ROOM = 24;

/**
 * Maj+Échap (spec fenêtre §6.5): the terminal or field that has the keyboard
 * loses it, the active terminal is deactivated, nothing gets selected (a
 * click into a terminal selects it: that selection is cleared, or Suppr
 * would delete the terminal just left), and the keyboard goes to Excalidraw's
 * container, where Excalidraw reads its keys (OpenVibe does not set
 * `handleKeyboardGlobally`).
 */
export function releaseToCanvas(doc: Document = document) {
  const active = doc.activeElement;
  if (active instanceof HTMLElement) active.blur();
  canvasStore.getState().api?.updateScene({ appState: { activeEmbeddable: null, selectedElementIds: {}, selectedGroupIds: {} } });
  // Placement and link modes end here too: their own Escape listeners never see Maj+Échap.
  uiStore.getState().setPlacing(null);
  uiStore.getState().setLinking(null);
  doc.querySelector<HTMLElement>(".excalidraw-container")?.focus();
}

/** What the overview frames: the nodes and their group frames; the whole scene without nodes. */
export function overviewTargets(elements: readonly ExcalidrawElement[]): ExcalidrawElement[] {
  const live = elements.filter((e) => !e.isDeleted);
  const nodes = live.filter((e) => {
    const kind = nodeKindOf(e);
    return kind === "terminal" || kind === "orchestrator";
  });
  if (nodes.length === 0) return live;
  const holding = new Set(nodes.map((n) => n.frameId));
  return [...live.filter((e) => e.type === "frame" && holding.has(e.id) && groupInfoOf(e) !== null), ...nodes];
}

/** Ctrl+Maj+A (spec fenêtre §6.6): every node in view, with an animation and a 10 % margin, then the keyboard to the canvas. */
export function overview() {
  const api = canvasStore.getState().api;
  if (!api) return;
  const targets = overviewTargets(api.getSceneElements());
  if (targets.length > 0) api.scrollToContent(targets, { fitToViewport: true, viewportZoomFactor: 0.9, animate: true, canvasOffsets: ZONE_OFFSETS });
  releaseToCanvas();
}

/** A group of « Aller à » (spec fenêtre §7.2): its frame fitted, at 100 % at most, then the keyboard to the canvas. False when it is gone. */
export function focusGroup(frameId: string): boolean {
  const api = canvasStore.getState().api;
  const frame = api?.getSceneElements().find((e) => e.id === frameId && e.type === "frame");
  if (!api || !frame) return false;
  api.scrollToContent(frame, { fitToViewport: true, viewportZoomFactor: 0.9, animate: true, maxZoom: 1, canvasOffsets: { ...ZONE_OFFSETS, top: ZONE_OFFSETS.top + LABEL_ROOM } });
  releaseToCanvas();
  return true;
}
