// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { forwardWheel } from "@/fleet/linkOverlay";
import { installPinchZoom } from "./pinchZoom";

vi.mock("@/fleet/linkOverlay", () => ({ forwardWheel: vi.fn() }));

let uninstall: () => void;
let canvas: HTMLCanvasElement;
let node: HTMLElement;
let field: HTMLTextAreaElement;

beforeEach(() => {
  vi.mocked(forwardWheel).mockClear();
  document.body.innerHTML = `<div class="excalidraw"><canvas class="interactive"></canvas><div class="excalidraw__embeddable-container"><div id="node"><textarea id="field"></textarea></div></div></div><div id="shell"></div>`;
  canvas = document.querySelector("canvas")!;
  node = document.getElementById("node")!;
  field = document.getElementById("field") as HTMLTextAreaElement;
  uninstall = installPinchZoom(window);
});
afterEach(() => uninstall());

// happy-dom's WheelEvent drops ctrlKey: the flags are set on the event itself.
function wheel(ctrlKey: boolean, deltaY: number): WheelEvent {
  const event = new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaY });
  Object.defineProperty(event, "ctrlKey", { value: ctrlKey });
  return event;
}

describe("a trackpad pinch (wheel with ctrlKey)", () => {
  it("over a node goes on to the canvas, which zooms", () => {
    const event = wheel(true, -12);
    node.dispatchEvent(event);
    expect(forwardWheel).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBe(true);
  });

  it("over a text field of a node too", () => {
    field.dispatchEvent(wheel(true, 8));
    expect(forwardWheel).toHaveBeenCalledTimes(1);
  });

  it("stops before the node's own wheel listener", () => {
    const own = vi.fn();
    node.addEventListener("wheel", own);
    node.dispatchEvent(wheel(true, 8));
    expect(own).not.toHaveBeenCalled();
  });

  it("over the canvas itself is left to Excalidraw", () => {
    const event = wheel(true, -5);
    canvas.dispatchEvent(event);
    expect(forwardWheel).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  it("outside the canvas, or without ctrl, is left alone", () => {
    document.getElementById("shell")!.dispatchEvent(wheel(true, 5));
    node.dispatchEvent(wheel(false, 30));
    expect(forwardWheel).not.toHaveBeenCalled();
  });
});
