// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { returnKeyboardToCanvas } from "./keyboardFocus";

let frames: FrameRequestCallback[];

beforeEach(() => {
  frames = [];
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => frames.push(cb));
  document.body.innerHTML =
    '<div class="excalidraw-container" tabindex="0"></div><button id="trigger">⋯</button><textarea id="xterm"></textarea><input id="name" />';
});
afterEach(() => {
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

const settle = () => {
  while (frames.length > 0) frames.shift()!(0);
};

it("gives Excalidraw's container the keyboard a menu or popover left on its trigger (plan B1)", () => {
  document.getElementById("trigger")!.focus();
  returnKeyboardToCanvas();
  expect(document.activeElement?.id).toBe("trigger");
  settle();
  expect(document.activeElement).toBe(document.querySelector(".excalidraw-container"));
});

it("leaves a terminal or a text field its keyboard", () => {
  document.getElementById("xterm")!.focus();
  returnKeyboardToCanvas();
  settle();
  expect(document.activeElement?.id).toBe("xterm");
  document.getElementById("name")!.focus();
  returnKeyboardToCanvas();
  settle();
  expect(document.activeElement?.id).toBe("name");
});
