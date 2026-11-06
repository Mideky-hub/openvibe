// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installCloseThrough } from "./closeThrough";

let uninstall: () => void;
let canvas: HTMLCanvasElement;
let close: HTMLButtonElement;
const onClose = vi.fn();
const onCanvas = vi.fn();

beforeEach(() => {
  onClose.mockClear();
  onCanvas.mockClear();
  document.body.innerHTML = `<div class="excalidraw"><canvas class="interactive"></canvas><button data-node-close></button></div>`;
  canvas = document.querySelector("canvas")!;
  close = document.querySelector("button")!;
  close.getBoundingClientRect = () => ({ left: 100, right: 120, top: 50, bottom: 70, width: 20, height: 20, x: 100, y: 50, toJSON: () => ({}) });
  close.addEventListener("click", onClose);
  document.addEventListener("pointerdown", onCanvas);
  uninstall = installCloseThrough(window);
});
afterEach(() => {
  uninstall();
  document.removeEventListener("pointerdown", onCanvas);
});

function press(target: Element, clientX: number, clientY: number, button = 0) {
  const event = new MouseEvent("pointerdown", { bubbles: true, cancelable: true, clientX, clientY, button });
  target.dispatchEvent(event);
  return event;
}

describe("a press on a node's × that the canvas covers (backlog R3)", () => {
  it("closes at the first click, and keeps the canvas from selecting the node", () => {
    const event = press(canvas, 110, 60);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onCanvas).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(true);
  });

  it("leaves a press beside the × to the canvas", () => {
    press(canvas, 200, 60);
    expect(onClose).not.toHaveBeenCalled();
    expect(onCanvas).toHaveBeenCalledTimes(1);
  });

  it("leaves a press on the button itself alone: its own click will act", () => {
    press(close, 110, 60);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("ignores the other mouse buttons", () => {
    press(canvas, 110, 60, 2);
    expect(onClose).not.toHaveBeenCalled();
  });
});
