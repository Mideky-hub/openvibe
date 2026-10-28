/** The application's shortcuts (spec fenêtre §6.1), as the interface writes them. */
export type Shortcut = "Ctrl+Tab" | "Ctrl+Maj+Tab" | "Ctrl+P" | "Ctrl+Maj+P" | "Maj+Échap" | "Ctrl+Maj+A" | "Ctrl+G";

/** The part of a keydown event the shortcuts read. */
export type KeyLike = Pick<KeyboardEvent, "key" | "ctrlKey" | "shiftKey" | "altKey" | "metaKey" | "repeat" | "isComposing">;

/** A held key repeats these only (spec fenêtre §6.2). */
const REPEATABLE: ReadonlySet<Shortcut> = new Set<Shortcut>(["Ctrl+Tab", "Ctrl+Maj+Tab"]);

function match(key: string, ctrl: boolean, shift: boolean): Shortcut | null {
  if (ctrl && key === "Tab") return shift ? "Ctrl+Maj+Tab" : "Ctrl+Tab";
  if (ctrl && key === "p") return shift ? "Ctrl+Maj+P" : "Ctrl+P";
  if (ctrl && shift && key === "a") return "Ctrl+Maj+A";
  if (ctrl && !shift && key === "g") return "Ctrl+G";
  if (!ctrl && shift && key === "Escape") return "Maj+Échap";
  return null;
}

/**
 * The shortcut a keydown makes, if any (spec fenêtre §6.2). Letters are read
 * as printed (`key`, any case: P is P in AZERTY as in QWERTY); Alt, hence
 * AltGr, never makes a shortcut, nor does a key typed during an IME composition.
 */
export function shortcutOf(event: KeyLike): Shortcut | null {
  if (event.isComposing || event.altKey || event.metaKey) return null;
  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
  const shortcut = match(key, event.ctrlKey, event.shiftKey);
  if (!shortcut || (event.repeat && !REPEATABLE.has(shortcut))) return null;
  return shortcut;
}

/**
 * A modal dialog takes every key (spec fenêtre §6.2): ours (closing a node,
 * terminal options) and Excalidraw's, whose container only exists while open.
 */
export function isModalOpen(root: ParentNode = document): boolean {
  return root.querySelector('[data-slot="dialog-content"], .excalidraw-modal-container') !== null;
}
