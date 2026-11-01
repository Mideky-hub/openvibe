// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { uiStore } from "@/store/ui";
import { LinkMode } from "./LinkMode";

vi.mock("@excalidraw/excalidraw", () => ({}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;
const toggle = vi.fn();

beforeEach(async () => {
  document.body.innerHTML = '<button data-link-toggle id="finish">Terminer</button>';
  document.getElementById("finish")!.addEventListener("click", toggle);
  toggle.mockClear();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  uiStore.setState({ linking: "chef" });
  await act(async () => root.render(<LinkMode />));
});
afterEach(async () => {
  await act(async () => root.unmount());
  uiStore.setState({ linking: null });
  document.body.replaceChildren();
});

it("passes a click on « Terminer » through the layer that covers it (plan B3)", async () => {
  Object.defineProperty(document, "elementsFromPoint", { value: () => [document.getElementById("finish")], configurable: true });
  const layer = host.ownerDocument.querySelector<HTMLElement>(".cursor-crosshair")!;
  await act(async () => layer.dispatchEvent(new MouseEvent("click", { bubbles: true, clientX: 5, clientY: 5 })));
  expect(toggle).toHaveBeenCalledTimes(1);
  // The mode is left to the button, not ended twice by the layer's own click-in-the-void rule.
  expect(uiStore.getState().linking).toBe("chef");
});
