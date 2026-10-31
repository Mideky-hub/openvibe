// @vitest-environment happy-dom
import { expect, it, vi } from "vitest";
import { keepFieldWheel } from "./keepWheel";

it("keeps the wheel over a text field from reaching Excalidraw's container, which would scroll the canvas (plan B3)", () => {
  document.body.innerHTML = '<div id="container"><div id="node"><textarea></textarea><span id="plain"></span></div></div>';
  const reached = vi.fn();
  document.getElementById("container")!.addEventListener("wheel", reached);
  const stop = keepFieldWheel(document.getElementById("node")!);
  document.querySelector("textarea")!.dispatchEvent(new Event("wheel", { bubbles: true, cancelable: true }));
  expect(reached).not.toHaveBeenCalled();
  // Elsewhere in the node the canvas keeps its wheel.
  document.getElementById("plain")!.dispatchEvent(new Event("wheel", { bubbles: true, cancelable: true }));
  expect(reached).toHaveBeenCalledTimes(1);
  stop();
  document.querySelector("textarea")!.dispatchEvent(new Event("wheel", { bubbles: true, cancelable: true }));
  expect(reached).toHaveBeenCalledTimes(2);
});
