/**
 * A node's × (terminal, orchestrator) sits under Excalidraw's canvas until the
 * node is activated: the first press only selected the node, the second
 * closed it. In capture, a press that lands on a × by its position closes the
 * node at once and never reaches the canvas, so nothing gets selected.
 */
export function installCloseThrough(win: Window): () => void {
  const onPointerDown = (event: PointerEvent) => {
    if (event.button !== 0 || !(event.target instanceof Element)) return;
    if (!event.target.closest(".excalidraw") || event.target.closest("[data-node-close]")) return;
    for (const button of win.document.querySelectorAll<HTMLElement>("[data-node-close]")) {
      const box = button.getBoundingClientRect();
      if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) continue;
      event.preventDefault();
      event.stopPropagation();
      button.click();
      return;
    }
  };
  win.document.addEventListener("pointerdown", onPointerDown as EventListener, { capture: true });
  return () => win.document.removeEventListener("pointerdown", onPointerDown as EventListener, { capture: true });
}
