/** Excalidraw's interactive canvas: where it reads pointers and the wheel from. */
const interactiveCanvas = () => document.querySelector<HTMLCanvasElement>(".excalidraw canvas.interactive");

/** The wheel a covering layer receives goes on to the canvas, so the view still scrolls and zooms (plan B3). */
export function forwardWheel(event: Pick<WheelEvent, "deltaX" | "deltaY" | "ctrlKey" | "metaKey" | "clientX" | "clientY">) {
  interactiveCanvas()?.dispatchEvent(
    new WheelEvent("wheel", {
      deltaX: event.deltaX,
      deltaY: event.deltaY,
      ctrlKey: event.ctrlKey,
      metaKey: event.metaKey,
      clientX: event.clientX,
      clientY: event.clientY,
      bubbles: true,
      cancelable: true,
    }),
  );
}

/** The « Terminer » button of an orchestrator, if the point is over it: the link layer takes the click away from it. */
export function finishButtonAt(x: number, y: number, doc: Document = document): HTMLElement | null {
  for (const element of doc.elementsFromPoint(x, y)) {
    const button = element.closest<HTMLElement>("[data-link-toggle]");
    if (button) return button;
  }
  return null;
}
