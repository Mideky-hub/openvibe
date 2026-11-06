/** A menu or popover that is open (Radix ones: dropdowns, the ＋ menu). */
const OPEN_MENU = '[role="menu"][data-state="open"], [data-radix-popper-content-wrapper] [data-state="open"]';

/**
 * Closes the open Radix menus with their own Escape: they are modal and take
 * the keyboard back from whatever the user does next (plan E1, plan G1).
 * Radix hears it on the document, in the capture phase; it does not bubble,
 * so the window's Escape listeners (placement, link mode) never hear it.
 */
export function closeOpenMenus(doc: Document = document) {
  const menu = doc.querySelector(OPEN_MENU);
  if (menu === null) return;
  menu.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: false, cancelable: true }));
}
