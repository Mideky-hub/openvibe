import { expect, it, vi } from "vitest";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { canvasStore } from "./canvasStore";
import { focusNode } from "./focusNode";

vi.mock("@excalidraw/excalidraw", () => ({}));
vi.mock("@/nodes/terminal/registry", () => ({ focusTerminal: vi.fn() }));

it("activates the element a fleet panel click centers on (spec habillage §5.5)", () => {
  const element = { id: "t1", x: 0, y: 0, width: 400, height: 300 };
  const updateScene = vi.fn();
  const api = {
    getSceneElements: () => [element],
    getAppState: () => ({ width: 1000, height: 800, zoom: { value: 1 }, scrollX: 0, scrollY: 0 }),
    updateScene,
  };
  canvasStore.setState({ api: api as unknown as ExcalidrawImperativeAPI });
  focusNode("t1");
  expect(updateScene.mock.calls[0][0].appState.activeEmbeddable).toEqual({ element, state: "active" });
});
