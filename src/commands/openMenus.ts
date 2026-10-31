/** A menu or popover that is open (Radix ones: dropdowns, the ＋ menu). */
const OPEN_MENU = '[role="menu"][data-state="open"], [data-radix-popper-content-wrapper] [data-state="open"]';

/**
 * Closes the open Radix menus with their own Escape: they are modal and take
 * the keyboard back from whatever the user does next (plan E1, plan G1).
 */
export function closeOpenMenus(doc: Document = document) {
  if (doc.querySelector(OPEN_MENU) === null) return;
  doc.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
}
