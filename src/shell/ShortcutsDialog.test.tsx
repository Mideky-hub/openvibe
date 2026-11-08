// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterAll, afterEach, beforeEach, expect, it, vi } from "vitest";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { shortcutBindingsStore } from "@/commands/shortcuts";
import { langStore } from "@/i18n";
import { ShortcutsDialog } from "./ShortcutsDialog";
import { shortcutsDialogStore } from "./shortcutsDialogState";

// The registry names the functions; the canvas behind it is not needed here.
vi.mock("@excalidraw/excalidraw", () => ({}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let saved: unknown[];
let host: HTMLDivElement;
let root: Root;

beforeEach(async () => {
  saved = [];
  langStore.setState({ lang: "fr" } as never);
  shortcutBindingsStore.setState({ bindings: {} });
  mockIPC((cmd, args) => {
    if (cmd === "set_setting") saved.push((args as { value: unknown }).value);
    return null;
  });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  shortcutsDialogStore.setState({ open: true });
  await act(async () => root.render(<ShortcutsDialog />));
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  shortcutsDialogStore.setState({ open: false });
});
afterAll(() => clearMocks());

const row = (shortcut: string) => document.querySelector<HTMLElement>(`[data-shortcut="${shortcut}"]`)!;
const keysOf = (shortcut: string) => row(shortcut).querySelector<HTMLButtonElement>("button[data-keys]")!;
const press = async (target: HTMLElement, init: KeyboardEventInit) => {
  await act(async () => {
    target.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init }));
  });
};

it("lists each function with its keys", () => {
  expect(row("Ctrl+P").textContent).toContain("Aller à…");
  expect(keysOf("Ctrl+P").textContent).toBe("Ctrl+P");
  expect(keysOf("Maj+Échap").textContent).toBe("Maj+Échap");
});

it("gives a function the keys pressed, and saves them", async () => {
  await act(async () => keysOf("Ctrl+P").click());
  expect(keysOf("Ctrl+P").textContent).toBe("Appuie sur les touches…");
  // A modifier alone waits for the rest.
  await press(keysOf("Ctrl+P"), { key: "Control", ctrlKey: true });
  expect(keysOf("Ctrl+P").textContent).toBe("Appuie sur les touches…");
  await press(keysOf("Ctrl+P"), { key: "k", ctrlKey: true });
  expect(keysOf("Ctrl+P").textContent).toBe("Ctrl+K");
  expect(shortcutBindingsStore.getState().bindings).toEqual({ "Ctrl+P": "Ctrl+K" });
  expect(saved).toEqual([{ "Ctrl+P": "Ctrl+K" }]);
});

it("refuses keys another function has, and says which", async () => {
  await act(async () => keysOf("Ctrl+P").click());
  await press(keysOf("Ctrl+P"), { key: "g", ctrlKey: true });
  expect(document.querySelector('[role="alert"]')?.textContent).toBe("Ctrl+G est déjà le raccourci de « Aller à la ligne… ».");
  expect(shortcutBindingsStore.getState().bindings).toEqual({});
  expect(saved).toEqual([]);
});

it("cancels with Échap alone, keeping the dialog open", async () => {
  await act(async () => keysOf("Ctrl+G").click());
  await press(keysOf("Ctrl+G"), { key: "Escape" });
  expect(keysOf("Ctrl+G").textContent).toBe("Ctrl+G");
  expect(shortcutsDialogStore.getState().open).toBe(true);
});

it("gives every function its own keys back", async () => {
  shortcutBindingsStore.setState({ bindings: { "Ctrl+G": "F4" } });
  await act(async () => Promise.resolve());
  expect(keysOf("Ctrl+G").textContent).toBe("F4");
  const resetAll = [...document.querySelectorAll("button")].find((b) => b.textContent === "Tout rétablir")!;
  await act(async () => resetAll.click());
  expect(keysOf("Ctrl+G").textContent).toBe("Ctrl+G");
  expect(saved).toEqual([{}]);
});
