// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { checkCombo, comboFor, comboOf, isModalOpen, readBindings, shortcutBindingsStore, shortcutOf, type KeyLike } from "./shortcuts";

const key = (fields: Partial<KeyLike>): KeyLike => ({
  key: "",
  ctrlKey: false,
  shiftKey: false,
  altKey: false,
  metaKey: false,
  repeat: false,
  isComposing: false,
  ...fields,
});

describe("shortcutOf (spec fenêtre §6.1, §6.2)", () => {
  it("recognizes each shortcut of the application", () => {
    expect(shortcutOf(key({ key: "Tab", ctrlKey: true }))).toBe("Ctrl+Tab");
    expect(shortcutOf(key({ key: "Tab", ctrlKey: true, shiftKey: true }))).toBe("Ctrl+Maj+Tab");
    expect(shortcutOf(key({ key: "p", ctrlKey: true }))).toBe("Ctrl+P");
    expect(shortcutOf(key({ key: "P", ctrlKey: true, shiftKey: true }))).toBe("Ctrl+Maj+P");
    expect(shortcutOf(key({ key: "Escape", shiftKey: true }))).toBe("Maj+Échap");
    expect(shortcutOf(key({ key: "A", ctrlKey: true, shiftKey: true }))).toBe("Ctrl+Maj+A");
    expect(shortcutOf(key({ key: "g", ctrlKey: true }))).toBe("Ctrl+G");
    expect(shortcutOf(key({ key: "G", ctrlKey: true, shiftKey: true }))).toBeNull();
  });

  it("reads the letter as printed: P on an AZERTY keyboard, whatever the case", () => {
    expect(shortcutOf({ ...key({ key: "p", ctrlKey: true }), code: "KeyP" } as KeyLike)).toBe("Ctrl+P");
    expect(shortcutOf(key({ key: "P", ctrlKey: true }))).toBe("Ctrl+P");
  });

  it("never makes a shortcut with Alt or AltGr, nor during an IME composition", () => {
    expect(shortcutOf(key({ key: "Tab", ctrlKey: true, altKey: true }))).toBeNull();
    expect(shortcutOf(key({ key: "p", ctrlKey: true, altKey: true }))).toBeNull();
    expect(shortcutOf(key({ key: "Tab", ctrlKey: true, isComposing: true }))).toBeNull();
    expect(shortcutOf(key({ key: "Tab", ctrlKey: true, metaKey: true }))).toBeNull();
  });

  it("lets a held key repeat Ctrl+Tab and Ctrl+Maj+Tab only", () => {
    expect(shortcutOf(key({ key: "Tab", ctrlKey: true, repeat: true }))).toBe("Ctrl+Tab");
    expect(shortcutOf(key({ key: "Tab", ctrlKey: true, shiftKey: true, repeat: true }))).toBe("Ctrl+Maj+Tab");
    expect(shortcutOf(key({ key: "A", ctrlKey: true, shiftKey: true, repeat: true }))).toBeNull();
    expect(shortcutOf(key({ key: "Escape", shiftKey: true, repeat: true }))).toBeNull();
  });

  it("ignores everything else: plain Tab, Escape alone, Ctrl+A, Ctrl+Échap", () => {
    for (const fields of [{ key: "Tab" }, { key: "Escape" }, { key: "a", ctrlKey: true }, { key: "Escape", ctrlKey: true, shiftKey: true }, { key: "r" }]) {
      expect(shortcutOf(key(fields))).toBeNull();
    }
  });
});

describe("rebound shortcuts (issue #84)", () => {
  afterEach(() => shortcutBindingsStore.setState({ bindings: {} }));

  it("writes a key press as the interface writes a shortcut", () => {
    expect(comboOf(key({ key: "k", ctrlKey: true }))).toBe("Ctrl+K");
    expect(comboOf(key({ key: "K", ctrlKey: true, shiftKey: true }))).toBe("Ctrl+Maj+K");
    expect(comboOf(key({ key: "Escape", shiftKey: true }))).toBe("Maj+Échap");
    expect(comboOf(key({ key: "F2" }))).toBe("F2");
    expect(comboOf(key({ key: "5", ctrlKey: true }))).toBe("Ctrl+5");
    // A modifier alone, Alt, or a key no shortcut takes is no combination yet.
    for (const fields of [{ key: "Control", ctrlKey: true }, { key: "Shift", shiftKey: true }, { key: "k", ctrlKey: true, altKey: true }, { key: "é", ctrlKey: true }]) {
      expect(comboOf(key(fields))).toBeNull();
    }
  });

  it("runs a function from its new keys, and no longer from its old ones", () => {
    shortcutBindingsStore.setState({ bindings: { "Ctrl+P": "Ctrl+K" } });
    expect(shortcutOf(key({ key: "k", ctrlKey: true }))).toBe("Ctrl+P");
    expect(shortcutOf(key({ key: "p", ctrlKey: true }))).toBeNull();
    expect(comboFor("Ctrl+P")).toBe("Ctrl+K");
    expect(comboFor("Ctrl+G")).toBe("Ctrl+G");
  });

  it("keeps a held key repeating the steps between terminals only, wherever they are bound", () => {
    shortcutBindingsStore.setState({ bindings: { "Ctrl+Tab": "F6", "Ctrl+P": "F7" } });
    expect(shortcutOf(key({ key: "F6", repeat: true }))).toBe("Ctrl+Tab");
    expect(shortcutOf(key({ key: "F7", repeat: true }))).toBeNull();
  });

  it("refuses keys another function already has, and names it", () => {
    expect(checkCombo("Ctrl+P", "Ctrl+G")).toEqual({ ok: false, reason: "conflict", with: "Ctrl+G" });
    shortcutBindingsStore.setState({ bindings: { "Ctrl+G": "Ctrl+K" } });
    expect(checkCombo("Ctrl+P", "Ctrl+G")).toEqual({ ok: true });
    expect(checkCombo("Ctrl+P", "Ctrl+K")).toEqual({ ok: false, reason: "conflict", with: "Ctrl+G" });
  });

  it("accepts a function's own keys again", () => {
    shortcutBindingsStore.setState({ bindings: { "Ctrl+P": "Ctrl+K" } });
    expect(checkCombo("Ctrl+P", "Ctrl+K")).toEqual({ ok: true });
    expect(checkCombo("Ctrl+P", "Ctrl+P")).toEqual({ ok: true });
  });

  it("refuses keys that would take typing, or that copy, paste and undo", () => {
    expect(checkCombo("Ctrl+P", "Maj+K")).toEqual({ ok: false, reason: "needsModifier" });
    expect(checkCombo("Ctrl+P", "Échap")).toEqual({ ok: false, reason: "needsModifier" });
    for (const combo of ["Ctrl+C", "Ctrl+V", "Ctrl+X", "Ctrl+Z", "Ctrl+Y", "Ctrl+A", "Ctrl+Maj+C", "Ctrl+Maj+V"]) {
      expect(checkCombo("Ctrl+P", combo)).toEqual({ ok: false, reason: "reserved" });
    }
    expect(checkCombo("Ctrl+P", "Ctrl+D", ["Ctrl+D"])).toEqual({ ok: false, reason: "reserved" });
  });

  it("reads saved bindings, dropping what would break a shortcut", () => {
    expect(
      readBindings({ "Ctrl+P": "Ctrl+K", "Ctrl+G": "Ctrl+K", "Ctrl+Tab": "Ctrl+C", nope: "Ctrl+J", "Ctrl+Maj+A": 3, "Maj+Échap": "Maj+Échap" }),
    ).toEqual({ "Ctrl+P": "Ctrl+K" });
    expect(readBindings("Ctrl+K")).toEqual({});
    expect(readBindings({ "Ctrl+P": "Ctrl+G", "Ctrl+G": "Ctrl+P" })).toEqual({ "Ctrl+P": "Ctrl+G", "Ctrl+G": "Ctrl+P" });
  });
});

describe("isModalOpen", () => {
  afterEach(() => document.body.replaceChildren());

  it("sees an open dialog of ours or of Excalidraw, not a menu or a popover", () => {
    expect(isModalOpen()).toBe(false);
    document.body.innerHTML = '<div data-slot="dropdown-menu-content"></div><div data-slot="popover-content" role="dialog"></div>';
    expect(isModalOpen()).toBe(false);
    document.body.innerHTML = '<div data-slot="dialog-content"></div>';
    expect(isModalOpen()).toBe(true);
    document.body.innerHTML = '<div class="excalidraw excalidraw-modal-container"></div>';
    expect(isModalOpen()).toBe(true);
  });
});
