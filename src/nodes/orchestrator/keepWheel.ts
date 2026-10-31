/**
 * Excalidraw pans and zooms on a wheel whose target is a textarea (xterm's
 * input sits over the terminal's cursor). Over an orchestrator's field the
 * wheel belongs to the field: it stops here, before the container.
 */
export function keepFieldWheel(node: HTMLElement): () => void {
  const onWheel = (event: Event) => {
    if (event.target instanceof HTMLTextAreaElement) event.stopPropagation();
  };
  node.addEventListener("wheel", onWheel);
  return () => node.removeEventListener("wheel", onWheel);
}
