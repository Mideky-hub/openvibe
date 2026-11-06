import { expect, it, vi } from "vitest";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { canvasStore } from "./canvasStore";
import { focusNode, frameNodes } from "./focusNode";

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

it("unfolds the folded group of the agent first (spec replier un groupe §2)", async () => {
  const setGroupFolded = vi.fn();
  vi.stubGlobal("requestAnimationFrame", () => 0);
  vi.doMock("@/fleet/groups", () => ({ setGroupFolded }));
  const element = { id: "t1", x: 0, y: 0, width: 400, height: 300 };
  canvasStore.setState({
    frames: [{ id: "g", name: "G", x: 0, y: 0, width: 1, height: 1, group: { role: "general", pantheon: "greek", folded: true }, memberIds: ["t1"] }] as never,
    api: {
      getSceneElements: () => [element],
      getAppState: () => ({ width: 1000, height: 800, zoom: { value: 1 }, scrollX: 0, scrollY: 0 }),
      updateScene: vi.fn(),
    } as unknown as ExcalidrawImperativeAPI,
  });
  focusNode("t1");
  await vi.waitFor(() => expect(setGroupFolded).toHaveBeenCalledWith("g", false));
  canvasStore.setState({ frames: [] });
});

it("frames a mission's team: its nodes fitted, at 100 % at most, under the glass bars (#63)", () => {
  const scrollToContent = vi.fn();
  const chef = { id: "chef" };
  const isis = { id: "isis" };
  canvasStore.setState({ api: { getSceneElements: () => [chef, { id: "other" }, isis], scrollToContent } as unknown as ExcalidrawImperativeAPI });
  expect(frameNodes(["chef", "isis", "gone"])).toBe(true);
  expect(scrollToContent).toHaveBeenCalledWith([chef, isis], { fitToViewport: true, viewportZoomFactor: 0.9, animate: true, maxZoom: 1, canvasOffsets: { top: 72, bottom: 60 } });
});

it("frames nothing when none of the team is on the canvas", () => {
  const scrollToContent = vi.fn();
  canvasStore.setState({ api: { getSceneElements: () => [{ id: "other" }], scrollToContent } as unknown as ExcalidrawImperativeAPI });
  expect(frameNodes(["isis"])).toBe(false);
  expect(scrollToContent).not.toHaveBeenCalled();
});
