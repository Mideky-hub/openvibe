import { forwardWheel } from "@/fleet/linkOverlay";

/**
 * A trackpad pinch reaches WebView2 as a wheel with ctrlKey. Excalidraw only
 * zooms on one aimed at its canvas; over a node (terminal, board, field) it
 * swallows it to block the browser zoom, so the pinch did nothing. In capture,
 * before the nodes' own listeners, the pinch goes on to the canvas.
 */
export function installPinchZoom(win: Window): () => void {
  const onWheel = (event: WheelEvent) => {
    if (!event.ctrlKey || !(event.target instanceof Element)) return;
    if (!event.target.closest(".excalidraw") || event.target.matches("canvas.interactive")) return;
    event.preventDefault();
    event.stopPropagation();
    forwardWheel(event);
  };
  win.document.addEventListener("wheel", onWheel as EventListener, { capture: true, passive: false });
  return () => win.document.removeEventListener("wheel", onWheel as EventListener, { capture: true });
}
