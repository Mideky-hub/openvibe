// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { readSource } from "@/theme/cssBlocks";
import type { Command, CommandContext } from "./command";
import { installShortcuts } from "./dispatch";
import { openPalette, paletteStore } from "./paletteState";

vi.mock("./registry", () => ({ COMMANDS: [], commandContext: () => ({}) }));

const ctx: CommandContext = { project: true, workspaceId: "w1", terminalCount: 2, terminalId: "isis" };
let available: boolean;
const run = vi.fn();
const next: Command = { id: "terminal.next", label: "Terminal suivant", section: "Navigation", keywords: [], shortcut: "Ctrl+Tab", available: () => available, run };
let uninstall: () => void;
let xterm: HTMLTextAreaElement;
const reachedXterm = vi.fn();

beforeEach(() => {
  available = true;
  run.mockClear();
  reachedXterm.mockClear();
  document.body.innerHTML = '<div data-terminal="isis"><textarea></textarea></div>';
  xterm = document.querySelector("textarea")!;
  xterm.addEventListener("keydown", reachedXterm);
  uninstall = installShortcuts(window, [next], () => ctx);
});
afterEach(() => {
  uninstall();
  document.body.replaceChildren();
});

const press = (init: KeyboardEventInit) => {
  const event = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init });
  xterm.dispatchEvent(event);
  return event;
};

it("runs the shortcut's command and keeps the key from the terminal and its agent (spec fenêtre §6.2)", () => {
  const event = press({ key: "Tab", ctrlKey: true });
  expect(run).toHaveBeenCalledWith(ctx);
  expect(event.defaultPrevented).toBe(true);
  expect(reachedXterm).not.toHaveBeenCalled();
});

it("lets a key through when its command is unavailable, or when it is no shortcut", () => {
  available = false;
  expect(press({ key: "Tab", ctrlKey: true }).defaultPrevented).toBe(false);
  available = true;
  expect(press({ key: "Tab" }).defaultPrevented).toBe(false);
  expect(press({ key: "p", ctrlKey: true }).defaultPrevented).toBe(false);
  expect(run).not.toHaveBeenCalled();
  expect(reachedXterm).toHaveBeenCalledTimes(3);
});

it("lets every key through while a modal dialog is open", () => {
  const dialog = document.createElement("div");
  dialog.dataset.slot = "dialog-content";
  document.body.append(dialog);
  expect(press({ key: "Tab", ctrlKey: true }).defaultPrevented).toBe(false);
  expect(run).not.toHaveBeenCalled();
  expect(reachedXterm).toHaveBeenCalled();
});

it("closes the palette before a command that moves the keyboard: no key typed after it reaches an agent", () => {
  openPalette("goTo", ctx);
  press({ key: "Tab", ctrlKey: true });
  expect(run).toHaveBeenCalled();
  expect(paletteStore.getState().open).toBe(false);
});

it("stops listening once uninstalled", () => {
  uninstall();
  press({ key: "Tab", ctrlKey: true });
  expect(run).not.toHaveBeenCalled();
  uninstall = () => undefined;
});

it("is installed once, at startup, for the app's whole life, with the focus tracking", () => {
  const main = readSource("main.tsx");
  expect(main).toContain("installShortcuts(window);");
  expect(main).toContain("trackTerminalFocus(document);");
});

it("consumes the repeats of a held shortcut that does not repeat, without running it again", () => {
  const p: Command = { ...next, id: "palette.goTo", shortcut: "Ctrl+P" };
  uninstall();
  uninstall = installShortcuts(window, [p], () => ctx);
  const event = press({ key: "p", ctrlKey: true, repeat: true });
  expect(run).not.toHaveBeenCalled();
  expect(event.defaultPrevented).toBe(true);
  expect(reachedXterm).not.toHaveBeenCalled();
});

it("closes an open dropdown menu before the command runs: the menu would take the keyboard back", () => {
  const menu = document.createElement("div");
  menu.setAttribute("role", "menu");
  menu.dataset.state = "open";
  document.body.append(menu);
  const escapes: string[] = [];
  document.addEventListener("keydown", (e) => e.key === "Escape" && escapes.push(e.key), { once: true });
  press({ key: "Tab", ctrlKey: true });
  expect(escapes).toEqual(["Escape"]);
  expect(run).toHaveBeenCalled();
});
