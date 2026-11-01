import type { NormalizedZoomValue } from "@excalidraw/excalidraw/types";
import { ZONE_OFFSETS } from "./canvasFocus";
import { canvasStore } from "./canvasStore";
import { zoomAroundCenter } from "./zoom";

/** « Ajuster la vue » of the rail, « Ajuster à la scène » of the palette: the whole scene in view. */
export function fitScene() {
  const api = canvasStore.getState().api;
  const elements = api?.getSceneElements() ?? [];
  if (api && elements.length > 0) api.scrollToContent(elements, { fitToViewport: true, viewportZoomFactor: 0.9, animate: true, canvasOffsets: ZONE_OFFSETS });
}

/** The zoom control's steps and « Zoom 100 % »: `next`, around the view's center. */
export function zoomTo(next: number) {
  const { api, view } = canvasStore.getState();
  if (!api) return;
  const target = zoomAroundCenter(view, next);
  api.updateScene({
    appState: { zoom: { value: target.zoom as NormalizedZoomValue }, scrollX: target.scrollX, scrollY: target.scrollY },
  });
}
