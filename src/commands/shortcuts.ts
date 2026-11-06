import { createStore, useStore } from "zustand";

/**
 * The application's shortcuts (spec fenêtre §6.1), as the interface writes
 * them. Each names its function's place for good: the settings can give that
 * function other keys (issue #84).
 */
export const SHORTCUTS = ["Ctrl+Tab", "Ctrl+Maj+Tab", "Ctrl+P", "Ctrl+Maj+P", "Maj+Échap", "Ctrl+Maj+A", "Ctrl+G"] as const;
export type Shortcut = (typeof SHORTCUTS)[number];

/** The part of a keydown event the shortcuts read. */
export type KeyLike = Pick<KeyboardEvent, "key" | "ctrlKey" | "shiftKey" | "altKey" | "metaKey" | "repeat" | "isComposing">;

/** A held key repeats these only (spec fenêtre §6.2), whatever keys they are given. */
const REPEATABLE: ReadonlySet<Shortcut> = new Set<Shortcut>(["Ctrl+Tab", "Ctrl+Maj+Tab"]);

/** Keys given another function than their own: « Ctrl+P » → « Ctrl+K ». */
export type ShortcutBindings = Partial<Record<Shortcut, string>>;

export const shortcutBindingsStore = createStore<{ bindings: ShortcutBindings }>()(() => ({ bindings: {} }));
export const useShortcutBindings = () => useStore(shortcutBindingsStore, (s) => s.bindings);

/** The keys of a function now, as the interface writes them. */
export function comboFor(shortcut: Shortcut, bindings: ShortcutBindings = shortcutBindingsStore.getState().bindings): string {
  return bindings[shortcut] ?? shortcut;
}

/** Ctrl, then Maj, then a letter, a digit, Tab, Échap or F1 to F12. */
const COMBO = /^(Ctrl\+)?(Maj\+)?([A-Z0-9]|Tab|Échap|F[1-9]|F1[0-2])$/;

function keyName(key: string): string | null {
  if (key === "Escape") return "Échap";
  if (key === "Tab" || /^F([1-9]|1[0-2])$/.test(key)) return key;
  return /^[a-z0-9]$/i.test(key) ? key.toUpperCase() : null;
}

/**
 * A key press as the interface writes a shortcut, if a shortcut can take it.
 * Letters are read as printed (`key`, any case: P is P in AZERTY as in
 * QWERTY); Alt, hence AltGr, never makes one, nor does a key typed during an
 * IME composition.
 */
export function comboOf(event: KeyLike): string | null {
  if (event.isComposing || event.altKey || event.metaKey) return null;
  const name = keyName(event.key);
  if (!name) return null;
  return `${event.ctrlKey ? "Ctrl+" : ""}${event.shiftKey ? "Maj+" : ""}${name}`;
}

/** The shortcut a keydown makes, if any (spec fenêtre §6.2), at the keys the settings give it. */
export function shortcutOf(event: KeyLike): Shortcut | null {
  const shortcut = recognized(event);
  if (!shortcut || (event.repeat && !REPEATABLE.has(shortcut))) return null;
  return shortcut;
}

function recognized(event: KeyLike): Shortcut | null {
  const combo = comboOf(event);
  if (!combo) return null;
  const { bindings } = shortcutBindingsStore.getState();
  return SHORTCUTS.find((shortcut) => comboFor(shortcut, bindings) === combo) ?? null;
}

/** The shortcut a held key repeats while it does not repeat: consumed, not run (plan F1). */
export function heldShortcutOf(event: KeyLike): Shortcut | null {
  const shortcut = recognized(event);
  return shortcut && event.repeat && !REPEATABLE.has(shortcut) ? shortcut : null;
}

/** Copy, paste, cut, undo, redo and select all, in the fields and the terminals. */
const RESERVED = ["Ctrl+C", "Ctrl+V", "Ctrl+X", "Ctrl+Z", "Ctrl+Y", "Ctrl+A", "Ctrl+Maj+C", "Ctrl+Maj+V"];

export type ComboCheck = { ok: true } | { ok: false; reason: "needsModifier" | "reserved" } | { ok: false; reason: "conflict"; with: Shortcut };

/**
 * Whether `combo` can become the keys of `shortcut`: it needs Ctrl or a
 * function key (else it would take typing; Maj+Échap is the exception), it
 * leaves alone the keys everyone edits with and those of `reserved` (the
 * canvas's own), and no other function has it.
 */
export function checkCombo(
  shortcut: Shortcut,
  combo: string,
  reserved: readonly string[] = [],
  bindings: ShortcutBindings = shortcutBindingsStore.getState().bindings,
): ComboCheck {
  const parts = COMBO.exec(combo);
  const functionKey = parts?.[3]?.startsWith("F") === true && parts[3].length > 1;
  if (!parts || (!parts[1] && !functionKey && combo !== "Maj+Échap")) return { ok: false, reason: "needsModifier" };
  if (RESERVED.includes(combo) || reserved.includes(combo)) return { ok: false, reason: "reserved" };
  const other = SHORTCUTS.find((s) => s !== shortcut && comboFor(s, bindings) === combo);
  return other ? { ok: false, reason: "conflict", with: other } : { ok: true };
}

/**
 * The bindings saved in the settings, as far as they hold: a known function,
 * keys it can take, not its own keys again; of two functions given the same
 * keys, the first keeps them.
 */
export function readBindings(value: unknown, reserved: readonly string[] = []): ShortcutBindings {
  if (typeof value !== "object" || value === null) return {};
  const order: Shortcut[] = [];
  const bindings: ShortcutBindings = {};
  for (const [shortcut, combo] of Object.entries(value)) {
    const known = SHORTCUTS.find((s) => s === shortcut);
    if (!known || typeof combo !== "string" || combo === known) continue;
    const check = checkCombo(known, combo, reserved, {});
    if (!check.ok && check.reason !== "conflict") continue;
    bindings[known] = combo;
    order.push(known);
  }
  // The latest binding that clashes gives way, until none does: one that took
  // a function's own keys clashes alone, and goes.
  for (;;) {
    const clash = [...order].reverse().find((s) => bindings[s] !== undefined && SHORTCUTS.some((o) => o !== s && comboFor(o, bindings) === bindings[s]));
    if (!clash) return bindings;
    delete bindings[clash];
  }
}

/**
 * A modal dialog takes every key (spec fenêtre §6.2): ours (closing a node,
 * terminal options) and Excalidraw's, whose container only exists while open.
 */
export function isModalOpen(root: ParentNode = document): boolean {
  return root.querySelector('[data-slot="dialog-content"], .excalidraw-modal-container') !== null;
}
