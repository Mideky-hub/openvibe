import { nodesStore } from "@/store/nodes";

/** Per workspace, the last terminal whose xterm had the keyboard. */
const lastTerminals = new Map<string, string>();

/** The terminal node holding `element` (its root carries `data-terminal`), if any. */
export function terminalOfElement(element: Element | null): string | null {
  return element?.closest("[data-terminal]")?.getAttribute("data-terminal") ?? null;
}

/** The terminal whose xterm has the keyboard: xterm reads keys from a textarea. */
export function terminalWithKeyboard(doc: Document = document): string | null {
  const active = doc.activeElement;
  return active instanceof HTMLTextAreaElement ? terminalOfElement(active) : null;
}

/**
 * Follows the keyboard into the terminals (spec fenêtre §8): the start of
 * Ctrl+Tab when no terminal has the keyboard (spec fenêtre §6.3). A click on
 * a header button does not count, only xterm's input.
 */
export function trackTerminalFocus(doc: Document = document): () => void {
  const listener = (event: FocusEvent) => {
    if (!(event.target instanceof HTMLTextAreaElement)) return;
    const nodeId = terminalOfElement(event.target);
    const workspaceId = nodeId ? nodesStore.getState().nodes[nodeId]?.workspaceId : undefined;
    if (nodeId && workspaceId) lastTerminals.set(workspaceId, nodeId);
  };
  doc.addEventListener("focusin", listener);
  return () => doc.removeEventListener("focusin", listener);
}

export function lastTerminalOf(workspaceId: string): string | null {
  return lastTerminals.get(workspaceId) ?? null;
}

/**
 * After an action of ours (Dégrouper, Lancer 4…), Excalidraw's shortcuts
 * (Ctrl+Z first) answer only inside its container: the keyboard goes back
 * there once the menu or popover has handed it to its trigger (plan B1). A
 * terminal or a text field that has it keeps it.
 */
export function returnKeyboardToCanvas(doc: Document = document) {
  // Two frames: Radix gives the focus back to the trigger after the item's own handler.
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      const active = doc.activeElement;
      if (active instanceof HTMLElement && active.matches("input, textarea, [contenteditable='true'], [contenteditable='']")) return;
      doc.querySelector<HTMLElement>(".excalidraw-container")?.focus();
    }),
  );
}
