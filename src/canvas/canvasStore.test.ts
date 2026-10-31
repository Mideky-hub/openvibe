import { describe, expect, it, vi } from "vitest";
import type { AppState } from "@excalidraw/excalidraw/types";
import { canvasStore, EMPTY_VIEW, fullSizeView, sameView, viewFrom } from "./canvasStore";

const appState = (overrides: Record<string, unknown> = {}) =>
  ({
    scrollX: 10,
    scrollY: -5,
    zoom: { value: 0.5 },
    width: 800,
    height: 600,
    offsetLeft: 0,
    offsetTop: 0,
    activeTool: { type: "rectangle" },
    selectedElementIds: { b: true, a: true },
    ...overrides,
  }) as unknown as AppState;

describe("viewFrom", () => {
  it("keeps what the shell shows, with sorted selected ids", () => {
    expect(viewFrom(appState())).toEqual({
      scrollX: 10,
      scrollY: -5,
      zoom: 0.5,
      width: 800,
      height: 600,
      offsetLeft: 0,
      offsetTop: 0,
      tool: "rectangle",
      selectedIds: ["a", "b"],
      editingFrame: null,
      mode: null,
    });
  });

  it("tells the zen and reading modes (Alt+Z, Alt+R), which hide the tools", () => {
    expect(viewFrom(appState({ zenModeEnabled: true })).mode).toBe("zen");
    expect(viewFrom(appState({ viewModeEnabled: true })).mode).toBe("reading");
    expect(sameView(viewFrom(appState()), viewFrom(appState({ zenModeEnabled: true })))).toBe(false);
  });
});

describe("canvasStore", () => {
  it("only notifies when the view really changes", () => {
    const listener = vi.fn();
    const unsubscribe = canvasStore.subscribe(listener);
    canvasStore.getState().setView(viewFrom(appState()));
    canvasStore.getState().setView(viewFrom(appState({ selectedElementIds: { a: true, b: true } })));
    expect(listener).toHaveBeenCalledTimes(1);
    expect(sameView(EMPTY_VIEW, canvasStore.getState().view)).toBe(false);
    unsubscribe();
  });
});

describe("frames", () => {
  it("keeps the same frames object when the scene's frames did not change", () => {
    const frames = [{ id: "g", name: "G", x: 0, y: 0, width: 1, height: 1, group: null, memberIds: [] }];
    canvasStore.getState().setFrames(frames);
    canvasStore.getState().setFrames(frames.map((f) => ({ ...f })));
    expect(canvasStore.getState().frames).toBe(frames);
    canvasStore.getState().setFrames([]);
    expect(canvasStore.getState().frames).toEqual([]);
  });
});

describe("nodeIds", () => {
  it("keeps the same list when the scene's nodes did not change", () => {
    const ids = ["a", "b"];
    canvasStore.getState().setNodeIds(ids);
    canvasStore.getState().setNodeIds(["a", "b"]);
    expect(canvasStore.getState().nodeIds).toBe(ids);
    canvasStore.getState().setNodeIds([]);
  });
});

describe("fullSizeView", () => {
  it("centers the element in the viewport at 100 %", () => {
    const view = fullSizeView({ x: 1000, y: 500, width: 800, height: 400 }, { width: 1400, height: 900 });
    expect(view).toEqual({ zoom: { value: 1 }, scrollX: -700, scrollY: -250 });
  });
});

describe("links", () => {
  it("keeps the same map when the wires did not change", () => {
    const links = { o1: { groupIds: ["g1"], nodeIds: [] } };
    canvasStore.getState().setLinks(links);
    canvasStore.getState().setLinks({ o1: { groupIds: ["g1"], nodeIds: [] } });
    expect(canvasStore.getState().links).toBe(links);
    canvasStore.getState().setLinks({});
  });
});
