// @vitest-environment happy-dom
import { beforeEach, expect, it, vi } from "vitest";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { canvasStore, EMPTY_VIEW } from "./canvasStore";
import { fitScene, zoomTo } from "./viewActions";

const scrollToContent = vi.fn();
const updateScene = vi.fn();
const withScene = (elements: unknown[]) =>
  canvasStore.setState({
    api: { getSceneElements: () => elements, scrollToContent, updateScene } as unknown as ExcalidrawImperativeAPI,
    view: { ...EMPTY_VIEW, zoom: 0.5, width: 1000, height: 800 },
  });

beforeEach(() => {
  scrollToContent.mockClear();
  updateScene.mockClear();
});

it("fits the whole scene, and leaves an empty one alone (« Ajuster »)", () => {
  withScene([{ id: "a" }]);
  fitScene();
  expect(scrollToContent).toHaveBeenCalledWith([{ id: "a" }], { fitToViewport: true, viewportZoomFactor: 0.9, animate: true, canvasOffsets: { top: 72, bottom: 60 } });
  withScene([]);
  fitScene();
  expect(scrollToContent).toHaveBeenCalledTimes(1);
});

it("zooms around the view's center (« Zoom 100 % » and the zoom control)", () => {
  withScene([]);
  zoomTo(1);
  expect(updateScene.mock.calls[0][0].appState.zoom.value).toBe(1);
});
