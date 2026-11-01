// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { isModalOpen, shortcutOf, type KeyLike } from "./shortcuts";

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
