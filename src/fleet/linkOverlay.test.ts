// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from "vitest";
import { finishButtonAt, forwardWheel } from "./linkOverlay";

const at = (elements: Element[]) => Object.defineProperty(document, "elementsFromPoint", { value: () => elements, configurable: true });

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

it("forwards the wheel to Excalidraw's interactive canvas, deltas kept", () => {
  document.body.innerHTML = '<div class="excalidraw"><canvas class="interactive"></canvas></div>';
  const seen: WheelEvent[] = [];
  document.querySelector("canvas")!.addEventListener("wheel", (e) => seen.push(e));
  forwardWheel({ deltaX: 3, deltaY: -40, ctrlKey: true, metaKey: false, clientX: 10, clientY: 20 });
  expect(seen).toHaveLength(1);
  expect([seen[0].deltaX, seen[0].deltaY]).toEqual([3, -40]);
});

it("does nothing without a canvas", () => {
  expect(() => forwardWheel({ deltaX: 0, deltaY: 1, ctrlKey: false, metaKey: false, clientX: 0, clientY: 0 })).not.toThrow();
});

it("finds the Terminer button under a point, whatever covers it", () => {
  document.body.innerHTML = '<div id="layer"></div><button data-link-toggle><span id="label"></span></button>';
  at([document.getElementById("layer")!, document.getElementById("label")!]);
  expect(finishButtonAt(5, 5)).toBe(document.querySelector("button"));
  at([document.getElementById("layer")!]);
  expect(finishButtonAt(5, 5)).toBeNull();
});
