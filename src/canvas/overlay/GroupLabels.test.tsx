// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { uiStore } from "@/store/ui";
import { canvasStore } from "../canvasStore";
import { GroupLabels } from "./GroupLabels";

vi.mock("@excalidraw/excalidraw", () => ({}));
vi.mock("@/fleet/GroupMenu", () => ({ GroupMenu: () => null }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  canvasStore.setState({
    frames: [{ id: "g1", name: "Serveurs", x: 0, y: 0, width: 400, height: 300, group: { role: "backend", pantheon: "egypt" }, memberIds: [] }],
  });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  uiStore.setState({ renamingGroup: null });
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

it("takes the keyboard in the name field without scrolling the clipped label layer (plan F2)", async () => {
  const focus = vi.spyOn(HTMLElement.prototype, "focus");
  await act(async () => root.render(<GroupLabels />));
  await act(async () => uiStore.getState().setRenamingGroup("g1"));
  expect(document.querySelector("input")).not.toBeNull();
  expect(focus).toHaveBeenCalledWith({ preventScroll: true });
});

it("escapes a frame id in the rule that hides Excalidraw's native name (plan B1)", async () => {
  canvasStore.setState({
    frames: [{ id: 'g"]{x', name: "A", x: 0, y: 0, width: 400, height: 300, group: { role: "backend", pantheon: "egypt" }, memberIds: [] }],
  });
  await act(async () => root.render(<GroupLabels />));
  // Other modules (sonner) inject their own <style>: take the one hiding the frame names.
  const css = [...document.querySelectorAll("style")].map((el) => el.textContent ?? "").find((text) => text.includes("-frame-name-"))!;
  expect(css).toBe(`.excalidraw [id$="-frame-name-${CSS.escape('g"]{x')}"]{color:transparent!important}`);
  expect(css).not.toContain('g"]{x');
});
